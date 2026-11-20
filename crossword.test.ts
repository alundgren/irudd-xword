import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Collection } from "./collection";
import { dailyBrief, clueBank } from "./styles";
import { serve } from "./player";
import { cells, checkRect, validate, type Entry } from "./grid";
import { seeded, fill, layout } from "./newspaper";

function testPack() {
  const png = join(import.meta.dir, "illustration.png");
  return {
    layout: "illustrated-grid",
    picture_answer: "IS",
    picture_clue: "Fruset vatten",
    generated_png: png,
    extra_pictures: [{ answer: "TE", clue: "Varm dryck", generated_png: png }],
    words: { IT: "Datateknik", SE: "Titta" },
    entries: [
      ["IS", 4, 4, 1, 0],
      ["TE", 4, 5, 1, 0],
      ["IT", 4, 4, 0, 1],
      ["SE", 5, 4, 0, 1],
    ],
  };
}
test("legacy storage, authored editions, public projection and persistent progress", async () => {
  const directory = mkdtempSync(join(tmpdir(), "xword-test-"));
  const old = new Database(join(directory, "editions.sqlite"), {
    create: true,
  });
  old.exec(
    "CREATE TABLE editions(id INTEGER PRIMARY KEY,lang TEXT,day TEXT,entries TEXT,clues TEXT,feedback TEXT DEFAULT '')",
  );
  old.exec(
    "INSERT INTO editions(lang,day,entries,clues) VALUES('en','2025-01-02','[]','[]')",
  );
  old.close();
  let library = new Collection(import.meta.dir, directory);
  const server = serve(library, 0);
  try {
    const base = server.url.href;
    const get = async (route: string) =>
      (await fetch(new URL(route, base))).json();
    const post = async (route: string, data: unknown) =>
      (
        await fetch(new URL(route, base), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
        })
      ).json();
    expect(library.row(1)!.paper).toBe("newsprint");
    expect(library.row(1)!.voice).toBe("classic");
    expect(await get("editions")).toHaveLength(1);
    expect(
      (
        await fetch(new URL("generate", base), {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: '{"lang":"sv"}',
        })
      ).status,
    ).toBe(404);
    const pack = join(directory, "custom.json");
    writeFileSync(pack, JSON.stringify(testPack()));
    const id = library.publish("sv", pack);
    const puzzle = await get("p/" + id);
    expect(puzzle.panels.length).toBe(2);
    expect(Object.keys(puzzle.entries[0]).sort()).toEqual([
      "cells",
      "clue",
      "direction",
    ]);
    const entries: Entry[] = JSON.parse(library.row(id)!.entries);
    const grid = validate(entries);
    expect(
      Math.min(
        ...entries.map(
          (e) =>
            cells(e).filter((p) => grid.counts.get(String(p)) === 2).length,
        ),
      ),
    ).toBeGreaterThanOrEqual(2);
    expect(
      [...grid.counts.values()].filter((n) => n === 2).length /
        grid.letters.size,
    ).toBeGreaterThanOrEqual(0.6);
    for (const { slot, rect } of puzzle.panels) {
      checkRect(entries, rect);
      expect(
        (await fetch(new URL("panel/" + id + "/" + slot, base))).status,
      ).toBe(200);
    }
    const summary = async () =>
      (await get("library")).find((item: { id: number }) => item.id === id);
    expect(await summary()).toMatchObject({
      filled: 0,
      solved: false,
      total: grid.letters.size,
    });
    const [cell, value] = grid.letters.entries().next().value!;
    expect(await post("mark", { id, cell, value })).toEqual({ saved: true });
    expect(await summary()).toMatchObject({ filled: 1, solved: false });
    for (const [key, letter] of grid.letters)
      await post("mark", { id, cell: key, value: letter });
    expect(await summary()).toMatchObject({
      filled: grid.letters.size,
      solved: true,
    });
    await post("mark", { id, cell, value: value === "Z" ? "A" : "Z" });
    expect(await summary()).toMatchObject({
      filled: grid.letters.size,
      solved: false,
    });
    await post("mark", { id, cell, value: "" });
    expect(await summary()).toMatchObject({
      filled: grid.letters.size - 1,
      solved: false,
    });
    await post("mark", { id, cell, value });
    await post("feedback", { id, text: "Fler ordvitsar" });
    expect(
      await post("check", { id, guesses: Object.fromEntries(grid.letters) }),
    ).toEqual({ wrong: [], complete: true });
    expect(await post("check", { id, guesses: { [cell]: "?" } })).toEqual({
      wrong: [cell],
      complete: false,
    });
    library.db.close();
    library = new Collection(import.meta.dir, directory);
    expect(library.publicPuzzle(library.row(id)!).guesses[cell]).toBe(value);
    expect(library.history("sv")[0].feedback).toBe("Fler ordvitsar");
  } finally {
    server.stop(true);
    library.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
test("newspaper slot solver preserves unique words and crossings", () => {
  const slots = [
    [
      [1, 1],
      [2, 1],
    ],
    [
      [1, 2],
      [2, 2],
    ],
    [
      [1, 1],
      [1, 2],
    ],
    [
      [2, 1],
      [2, 2],
    ],
  ] as [number, number][][];
  const words = ["IS", "TE", "IT", "SE"];
  const answers = fill(
    slots,
    "IS",
    new Map(words.map((w, i) => [w, i])),
    seeded(4),
  )!;
  expect(new Set(answers)).toEqual(new Set(words));
  const entries: Entry[] = slots.map(([[x, y], [x2, y2]], i) => [
    answers[i],
    x,
    y,
    x2 - x,
    y2 - y,
  ]);
  expect(validate(entries).letters.size).toBe(4);
  expect(() => checkRect(entries, [1, 1, 1, 1])).toThrow();
  expect(() =>
    validate([
      ["AAA", 1, 1, 1, 0],
      ["BBB", 1, 5, 1, 0],
    ]),
  ).toThrow();
});

test("newspaper page sizes leave the picture clear and every answer crossed twice", () => {
  for (const large of [true, false])
    for (const corner of ["left", "right"] as const)
      for (let seed = 0; seed < 10; seed++) {
        const {
          slots,
          rect: [x, y, w, h],
        } = layout(large, seeded(seed), corner);
        expect(x === 0).toBe(corner === "left");
        for (const slot of slots) {
          const [a, b] = slot;
          const cx = 2 * a[0] - b[0],
            cy = 2 * a[1] - b[1];
          expect(cx < x || cy < y || cx >= x + w || cy >= y + h).toBe(true);
        }
        const counts = new Map<string, number>();
        for (const slot of slots)
          for (const p of slot)
            counts.set(String(p), (counts.get(String(p)) ?? 0) + 1);
        const dimensions = [0, 1].map(
          (axis) => 1 + Math.max(...slots.flat().map((p) => p[axis])),
        );
        expect(dimensions).toEqual(large ? [17, 19] : [8, 10]);
        expect(
          slots.every(
            (slot) =>
              slot.filter((p) => counts.get(String(p)) === 2).length >= 2,
          ),
        ).toBe(true);
        expect(
          slots
            .flat()
            .every(
              ([cx, cy]) => cx < x || cy < y || cx >= x + w || cy >= y + h,
            ),
        ).toBe(true);
      }
});

test("briefs rotate across calendar boundaries and accept independent editorial choices", () => {
  const days = Array.from({ length: 9 }, (_, i) =>
    new Date(Date.UTC(2026, 11, 28 + i)).toISOString().slice(0, 10),
  );
  const briefs = days.map((day) => dailyBrief(day));
  expect(new Set(briefs.map((b) => b.paper + "/" + b.voice)).size).toBe(9);
  expect(dailyBrief(days[0])).toEqual(briefs[0]);
  expect(dailyBrief(days[0], "fieldnotes", "right", "chalk")).toMatchObject({
    voice: "fieldnotes",
    paper: "chalk",
    picture_corner: "right",
  });
  expect(() => dailyBrief("2026-02-29")).toThrow();
  expect(() => dailyBrief(days[0], "other")).toThrow();
  expect(() => dailyBrief(days[0], undefined, undefined, "other")).toThrow();
  expect(clueBank({ ASK: "Request" }, "en", "wordplay")).toEqual({
    ASK: "Request",
  });
});

test("saved illustrations and authored clues survive publication and changing daily defaults", () => {
  const directory = mkdtempSync(join(tmpdir(), "xword-style-"));
  const library = new Collection(import.meta.dir, directory);
  try {
    const options = { day: "2026-11-20", paper: "chalk", voice: "wordplay" };
    const custom = testPack();
    custom.picture_clue = "Min bildnyckel";
    const note = "En närbild vid kajen";
    const file = join(directory, "pack.json");
    writeFileSync(file, JSON.stringify({ ...custom, entries: undefined }));
    expect(() => library.publish("sv", file, options)).toThrow("grid entries");
    writeFileSync(file, JSON.stringify({ ...custom, editorial_note: note }));
    const saved = library.row(library.publish("sv", file, options))!;
    expect(library.image(saved)?.size).toBeGreaterThan(0);
    const visible = library.publicPuzzle(saved);
    expect(
      visible.entries.some((e) => e.clue === "Bild 1 · Min bildnyckel"),
    ).toBe(true);
    expect(visible.paper).toBe("chalk");
    expect(visible).not.toHaveProperty("editorial_note");
    expect(library.recentEditions("sv", options.day)[0]).toMatchObject({
      editorial_note: note,
      voice: "wordplay",
    });
    expect(library.recentEditions("sv", "2026-11-19")).toHaveLength(0);
  } finally {
    library.db.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
