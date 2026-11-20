import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
const root = resolve(import.meta.dir, "..");
const [edition, ...args] = Bun.argv.slice(2);
if (!/^\d+$/.test(edition ?? "")) throw Error("Expected edition ID");
let port = 8766,
  widths = [390, 768, 980],
  output = join(root, "artifacts", "render-" + edition);
while (args.length) {
  const option = args.shift();
  if (option === "--port") port = Number(args.shift());
  else if (option === "--output") output = resolve(args.shift()!);
  else if (option === "--widths") {
    widths = [];
    while (args.length && !args[0].startsWith("--"))
      widths.push(Number(args.shift()));
  } else throw Error("Unknown render option " + option);
}
if (
  !widths.length ||
  widths.some((w) => !Number.isInteger(w) || w < 240 || w > 3840)
)
  throw Error("Expected viewport widths between 240 and 3840");
async function read(route: string) {
  const res = await fetch("http://127.0.0.1:" + port + route, {
    signal: AbortSignal.timeout(10000),
  });
  if (!res.ok) throw Error("Could not read " + route);
  return res;
}
mkdirSync(output, { recursive: true });
const temp = mkdtempSync(join(dirname(output), ".render-"));
try {
  const rows = (await (await read("/editions")).json()).filter(
    (r: unknown[]) => r[0] === Number(edition),
  );
  if (!rows.length) throw Error("Edition missing");
  const puzzle = await (await read("/p/" + edition)).json();
  await Bun.write(
    join(temp, "edition.json"),
    JSON.stringify({ ...puzzle, guesses: {}, feedback: "" }),
  );
  await Bun.write(join(temp, "editions.json"), JSON.stringify(rows));
  for (const { slot } of puzzle.panels ?? [])
    await Bun.write(
      join(temp, "panel-" + slot + ".png"),
      await read(`/panel/${edition}/${slot}`),
    );
  if (puzzle.layout !== "illustrated-grid")
    await Bun.write(join(temp, "picture.png"), await read("/image/" + edition));
  const version = (
    await Bun.file(
      join(root, "node_modules/playwright-core/package.json"),
    ).json()
  ).version;
  const mounts = [
    [temp, "data"],
    [join(root, "fonts"), "fonts"],
    [join(root, "tools/render.mjs"), "render.mjs"],
    [join(root, "dist/layout.js"), "layout.js"],
    [join(root, "index.html"), "index.html"],
    [
      join(root, "node_modules/playwright-core"),
      "node_modules/playwright-core",
    ],
  ];
  const proc = Bun.spawn(
    [
      "docker",
      "run",
      "--rm",
      "--init",
      "--network",
      "none",
      ...mounts.flatMap(([src, dst]) => ["-v", `${src}:/check/${dst}:ro`]),
      "-v",
      output + ":/out",
      `mcr.microsoft.com/playwright:v${version}-noble`,
      "node",
      "/check/render.mjs",
      ...widths.map(String),
    ],
    { stdout: "inherit", stderr: "inherit" },
  );
  process.exitCode = await proc.exited;
  console.log("Render artifacts:", output);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
