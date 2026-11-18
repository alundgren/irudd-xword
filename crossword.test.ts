import { expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Collection } from "./collection";
import { serve } from "./player";
import { cells, checkRect, validate, type Entry } from "./grid";
import { seeded, fill, layout } from "./newspaper";

test("legacy storage, dense and English generation, public projection and persistent progress", async () => {
  const directory = mkdtempSync(join(tmpdir(), "xword-test-"));
  const old = new Database(join(directory, "editions.sqlite"), {
    create: true,
  });
  old.exec(
    "CREATE TABLE editions(id INTEGER PRIMARY KEY,lang TEXT,day TEXT,entries TEXT,clues TEXT,feedback TEXT DEFAULT '')",
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
    const [[id]] = await get("editions");
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
    const [cell, value] = grid.letters.entries().next().value!;
    expect(await post("mark", { id, cell, value })).toEqual({ saved: true });
    await post("feedback", { id, text: "Fler ordvitsar" });
    expect(
      await post("check", { id, guesses: Object.fromEntries(grid.letters) }),
    ).toEqual({ wrong: [], complete: true });
    expect(await post("check", { id, guesses: { [cell]: "?" } })).toEqual({
      wrong: [cell],
      complete: false,
    });
    const generated = await post("generate", { lang: "en" });
    expect((await get("p/" + generated.id)).entries.length).toBeGreaterThan(1);
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
    for (let seed = 0; seed < 10; seed++) {
      const {
        slots,
        rect: [x, y, w, h],
      } = layout(large, seeded(seed));
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
          (slot) => slot.filter((p) => counts.get(String(p)) === 2).length >= 2,
        ),
      ).toBe(true);
      expect(
        slots
          .flat()
          .every(([cx, cy]) => cx < x || cy < y || cx >= x + w || cy >= y + h),
      ).toBe(true);
    }
});
