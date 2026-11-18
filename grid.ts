export type Cell = [number, number];
export type Entry = [string, number, number, number, number];
export type Rect = [number, number, number, number];
export type Words = Record<string, string>;
export type Pack = {
  picture_answer: string;
  picture_clue: string;
  generated_png: string;
  layout?: string;
  fill?: string;
  words?: Words;
  entries?: Entry[];
  extra_pictures?: { answer: string; clue: string; generated_png: string }[];
  picture_rect?: Rect;
  edition_day?: string;
  title?: string;
};
export const directions: Cell[] = [
  [1, 0],
  [0, 1],
];
export function cells([w, x, y, dx, dy]: Entry): Cell[] {
  return Array.from(w, (_, i) => [x + i * dx, y + i * dy]);
}
export function inspect(entries: Entry[]) {
  const letters = new Map<string, string>(),
    boxes = new Set<string>(),
    edges = new Set<string>(),
    counts = new Map<string, number>();
  for (const entry of entries) {
    const [word, x, y, dx, dy] = entry;
    boxes.add(String([x - dx, y - dy]));
    cells(entry).forEach((p, i) => {
      const key = String(p);
      if (letters.has(key) && letters.get(key) !== word[i])
        throw Error("Crossing mismatch");
      letters.set(key, word[i]);
      counts.set(key, (counts.get(key) ?? 0) + 1);
      if (i) {
        const edge = key + ":" + dx;
        if (edges.has(edge)) throw Error("Parallel overlap");
        edges.add(edge);
      }
    });
  }
  for (const key of letters.keys()) {
    if (boxes.has(key)) throw Error("Clue overlaps a letter");
    const [x, y] = key.split(",").map(Number);
    for (const [dx, dy] of directions) {
      const next = String([x + dx, y + dy]);
      if (letters.has(next) && !edges.has(next + ":" + dx))
        throw Error("Unclued adjacent letters");
    }
  }
  const occupied = new Set([...letters.keys(), ...boxes]);
  const points = [...occupied].map((k) => k.split(",").map(Number));
  const left = Math.min(...points.map((p) => p[0])),
    top = Math.min(...points.map((p) => p[1]));
  const width = Math.max(...points.map((p) => p[0])) - left + 1,
    height = Math.max(...points.map((p) => p[1])) - top + 1;
  return { letters, boxes, counts, occupied, left, top, width, height };
}
export function validate(entries: Entry[], words?: Words) {
  if (!Array.isArray(entries) || entries.length < 2 || entries.length > 100)
    throw Error("Expected 2–100 entries");
  const used = new Set<string>();
  for (const [w, x, y, dx, dy] of entries) {
    if (
      !/^[A-ZÅÄÖ]{2,30}$/.test(w) ||
      used.has(w) ||
      (words && !Object.hasOwn(words, w)) ||
      ![x, y, dx, dy].every(Number.isInteger) ||
      !((dx === 1 && dy === 0) || (dx === 0 && dy === 1))
    )
      throw Error("Invalid grid entry");
    used.add(w);
  }
  const grid = inspect(entries);
  if (
    grid.left < 0 ||
    grid.top < 0 ||
    grid.left + grid.width > 40 ||
    grid.top + grid.height > 40
  )
    throw Error("Grid outside 40×40 page");
  const paths = entries.map((e) => cells(e).map(String)),
    reached = new Set(paths.shift());
  while (paths.length) {
    const i = paths.findIndex((p) => p.some((k) => reached.has(k)));
    if (i < 0) throw Error("Disconnected answers");
    paths.splice(i, 1)[0].forEach((k) => reached.add(k));
  }
  return grid;
}
export function normalize(entries: Entry[]): Entry[] {
  const { left, top } = inspect(entries);
  return entries.map(([w, x, y, dx, dy]) => [w, x - left, y - top, dx, dy]);
}
export function rectangle([x, y, w, h]: Rect) {
  return Array.from({ length: w * h }, (_, i) =>
    String([x + (i % w), y + Math.floor(i / w)]),
  );
}
export function checkRect(entries: Entry[], rect: Rect) {
  const grid = inspect(entries);
  if (
    !Array.isArray(rect) ||
    rect.length !== 4 ||
    !rect.every(Number.isInteger)
  )
    throw Error("Expected integer rectangle");
  const [x, y, w, h] = rect;
  if (
    Math.min(x, y) < 0 ||
    Math.min(w, h) < 1 ||
    x + w > grid.left + grid.width ||
    y + h > grid.top + grid.height ||
    rectangle(rect).some((k) => grid.occupied.has(k))
  )
    throw Error("Invalid picture rectangle");
}
export function pictures(entries: Entry[], answers: string[]): Rect[] {
  const { occupied, width, height, left, top } = inspect(entries);
  return answers.map((answer) => {
    const entry = entries.find((e) => e[0] === answer);
    if (!entry) throw Error("Picture answer missing from grid");
    const [, cx, cy, dx, dy] = entry;
    let best: Rect | undefined,
      score = Infinity;
    for (const [w, h] of [
      [3, 3],
      [4, 2],
      [3, 2],
      [2, 3],
      [2, 2],
    ]) {
      for (let y = 0; y <= top + height - h; y++)
        for (let x = 0; x <= left + width - w; x++) {
          const rect: Rect = [x, y, w, h];
          if (rectangle(rect).some((k) => occupied.has(k))) continue;
          const distance =
            Math.max(x - cx + dx, cx - dx - (x + w - 1), 0) +
            Math.max(y - cy + dy, cy - dy - (y + h - 1), 0);
          const rank = distance - (w * h) / 3;
          if (
            rank < score ||
            (rank === score &&
              best &&
              (y < best[1] ||
                (y === best[1] &&
                  (x < best[0] || (x === best[0] && w < best[2])))))
          ) {
            score = rank;
            best = rect;
          }
        }
    }
    if (!best) throw Error("No space for picture");
    rectangle(best).forEach((k) => occupied.add(k));
    return best;
  });
}
export function metrics(pack: Pack) {
  const entries = pack.entries!,
    words = { ...pack.words, [pack.picture_answer]: pack.picture_clue };
  const grid = validate(entries, words);
  checkRect(entries, pack.picture_rect!);
  return {
    width: grid.left + grid.width,
    height: grid.top + grid.height,
    entries: entries.length,
    occupied: grid.occupied.size + rectangle(pack.picture_rect!).length,
    page_cells: (grid.width + grid.left) * (grid.height + grid.top),
    shared: [...grid.counts.values()].filter((n) => n === 2).length,
    letters: grid.letters.size,
    minimum_crossings: Math.min(
      ...entries.map(
        (e) => cells(e).filter((c) => grid.counts.get(String(c)) === 2).length,
      ),
    ),
    missing_clues: entries.filter((e) => !words[e[0]]?.trim()).length,
  };
}
