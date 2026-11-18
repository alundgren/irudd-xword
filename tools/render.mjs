import { readFile, writeFile } from "node:fs/promises";
import { webkit } from "playwright-core";

const root = "/check";
const puzzle = JSON.parse(await readFile(root + "/data/edition.json"));
const rows = JSON.parse(await readFile(root + "/data/editions.json"));
const edition = rows[0][0];
const files = new Map([
  ["/", ["index.html", "text/html"]],
  ["/fonts/Krysskrita.otf", ["fonts/Krysskrita.otf", "font/otf"]],
  ["/fonts/Rutverk.otf", ["fonts/Rutverk.otf", "font/otf"]],
  ["/layout.js", ["layout.js", "text/javascript"]],
  ["/editions", ["data/editions.json", "application/json"]],
  ["/p/" + edition, ["data/edition.json", "application/json"]],
  ["/image/" + edition, ["data/picture.png", "image/png"]],
]);
for (const { slot } of puzzle.panels ?? []) {
  files.set(`/panel/${edition}/${slot}`, [
    `data/panel-${slot}.png`,
    "image/png",
  ]);
}

// Check rendered line fragments, including arrows, against BOTH the clickable
// clue and the shared cell. Scroll dimensions alone miss overflowing siblings.
function inspectClues() {
  const failures = [];
  const inside = (r, b) =>
    r.left >= b.left - 1 &&
    r.right <= b.right + 1 &&
    r.top >= b.top - 1 &&
    r.bottom <= b.bottom + 1;
  for (const box of document.querySelectorAll(".box")) {
    const cell = box.getBoundingClientRect();
    const buttons = Array.from(box.querySelectorAll(".clue"));
    for (const [index, button] of buttons.entries()) {
      const buttonRect = button.getBoundingClientRect();
      const range = document.createRange();
      range.selectNodeContents(button);
      const lines = Array.from(range.getClientRects()).filter(
        (r) => r.width && r.height,
      );
      if (
        !inside(buttonRect, cell) ||
        !lines.length ||
        lines.some((r) => !inside(r, buttonRect) || !inside(r, cell)) ||
        (index &&
          buttonRect.top <
            buttons[index - 1].getBoundingClientRect().bottom - 1)
      ) {
        failures.push({
          column: box.style.gridColumnStart,
          row: box.style.gridRowStart,
          clue: button.textContent.trim(),
          part: index + 1,
          parts: buttons.length,
        });
      }
    }
  }
  return failures;
}

const browser = await webkit.launch();
const reports = [];
try {
  for (const width of process.argv.slice(2).map(Number)) {
    const page = await browser.newPage({ viewport: { width, height: 960 } });
    await page.route("**/*", async (route) => {
      const file = files.get(new URL(route.request().url()).pathname);
      if (!file) return route.abort();
      await route.fulfill({
        body: await readFile(root + "/" + file[0]),
        contentType: file[1],
      });
    });
    await page.goto("http://puzzle.local/");
    await page.waitForFunction(
      (n) => document.querySelectorAll(".clue").length === n,
      puzzle.entries.length,
    );
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map((img) => img.decode()));
    });
    const face = { chalk: "Krysskrita", mechanical: "Rutverk" }[puzzle.paper];
    if (
      face &&
      !(await page.evaluate(
        (font) => getComputedStyle(document.querySelector(".cell")).fontFamily.includes(font)
          && [...document.fonts].some(face => face.family === font && face.status === "loaded"),
        face,
      ))
    )
      throw Error("Edition font failed to load: " + face);
    const failures = await page.evaluate(inspectClues);
    const screenshot = `edition-${edition}-${width}.png`;
    await page.screenshot({ path: "/out/" + screenshot, fullPage: true });
    reports.push({ width, clues: puzzle.entries.length, failures, screenshot });
    console.log(`${width}px: ${failures.length} clipped or overlapping clues`);
    await page.close();
  }
} finally {
  await browser.close();
}
await writeFile(
  "/out/report.json",
  JSON.stringify({ edition, engine: "webkit", reports }, null, 2) + "\n",
);
if (reports.some((r) => r.failures.length)) process.exitCode = 1;
