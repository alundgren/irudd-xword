import { directions, validate, type Cell, type Entry, type Rect } from "./grid";
function shuffle<T>(items: T[], random = Math.random) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function seeded(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let v = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    v = (v + Math.imul(v ^ (v >>> 7), 61 | v)) ^ v;
    return ((v ^ (v >>> 14)) >>> 0) / 4294967296;
  };
}

export function layout(
  large: boolean,
  random: () => number,
  corner: "left" | "right" = "left",
) {
  const widths = large ? [3, 4, 3, 3] : [3, 3],
    heights = large ? [3, 3, 3, 3, 2] : [2, 3, 2],
    reserve = large ? 2 : 1;
  const offsets = (sizes: number[]) =>
    sizes.map((_, i) => sizes.slice(0, i).reduce((n, v) => n + v + 1, 0));
  const xs = offsets(widths),
    ys = offsets(heights),
    groups = new Map<string, Set<string>>(),
    board = new Set<string>();
  const first = corner === "left" ? 0 : widths.length - reserve;
  for (let i = 0; i < xs.length; i++)
    for (let j = 0; j < ys.length; j++) {
      if (i >= first && i < first + reserve && j < reserve) continue;
      const room = String([i, j]);
      groups.set(room, new Set([room]));
      for (let x = 1; x <= widths[i]; x++)
        for (let y = 1; y <= heights[j]; y++)
          board.add(String([xs[i] + x, ys[j] + y]));
    }
  const edges: [Cell, Cell][] = [];
  for (const key of groups.keys()) {
    const [i, j] = key.split(",").map(Number);
    for (const [di, dj] of directions) {
      const next: Cell = [i + di, j + dj];
      if (groups.has(String(next))) edges.push([[i, j], next]);
    }
  }
  // Connect adjacent blocks into one puzzle by opening a random spanning tree.
  for (const [room, other] of shuffle(edges, random)) {
    const a = groups.get(String(room))!,
      b = groups.get(String(other))!;
    if (a === b) continue;
    for (const key of b) {
      a.add(key);
      groups.set(key, a);
    }
    const [i, j] = room,
      [k, l] = other;
    board.add(
      String(
        j === l
          ? [xs[k], ys[j] + 1 + Math.floor(random() * heights[j])]
          : [xs[i] + 1 + Math.floor(random() * widths[i]), ys[l]],
      ),
    );
  }
  const slots: Cell[][] = [];
  for (const key of board) {
    const [x, y] = key.split(",").map(Number);
    for (const [dx, dy] of directions) {
      if (board.has(String([x - dx, y - dy]))) continue;
      const run: Cell[] = [];
      let cx = x,
        cy = y;
      while (board.has(String([cx, cy]))) {
        run.push([cx, cy]);
        cx += dx;
        cy += dy;
      }
      if (run.length >= 2) slots.push(run);
    }
  }
  const end = xs[first + reserve] ?? xs.at(-1)! + widths.at(-1)! + 1;
  return { slots, rect: [xs[first], 0, end - xs[first], ys[reserve]] as Rect };
}

export function fill(
  slots: Cell[][],
  theme: string,
  vocabulary: Map<string, number>,
  random: () => number,
) {
  const byLength = new Map<number, string[]>();
  for (const w of vocabulary.keys()) {
    if (!byLength.has(w.length)) byLength.set(w.length, []);
    byLength.get(w.length)!.push(w);
  }
  const domains = slots.map((s) => byLength.get(s.length) ?? []);
  if (domains.some((d) => !d.length)) return;
  const neighbors = slots.map(() => [] as [number, number, number][]);
  const occupants = new Map<string, [number, number]>();
  slots.forEach((s, i) =>
    s.forEach((cell, k) => {
      const prev = occupants.get(String(cell));
      if (prev) {
        const [j, l] = prev;
        neighbors[i].push([j, k, l]);
        neighbors[j].push([i, l, k]);
      } else occupants.set(String(cell), [i, k]);
    }),
  );
  const indices = slots.map((_, i) => i);
  let budget = 0;
  function search(
    remaining: number[],
    choices: string[][],
    picked: string[],
  ): string[] | undefined {
    if (!remaining.length) return picked;
    if (--budget < 0) return;
    const i = remaining.reduce((a, b) =>
      choices[b].length < choices[a].length ||
      (choices[b].length === choices[a].length &&
        neighbors[b].length > neighbors[a].length)
        ? b
        : a,
    );
    const rest = remaining.filter((j) => j !== i);
    const candidates = choices[i]
      .map((w) => ({
        w,
        rank: vocabulary.get(w)! - 800 * Math.log(1 - random()),
      }))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, 60);
    for (const { w } of candidates) {
      const next = choices.slice();
      for (const j of rest)
        if (slots[j].length === w.length)
          next[j] = next[j].filter((other) => other !== w);
      for (const [j, k, l] of neighbors[i])
        if (rest.includes(j))
          next[j] = next[j].filter((other) => other[l] === w[k]);
      if (rest.every((j) => next[j].length)) {
        picked[i] = w;
        const result = search(rest, next, picked);
        if (result) return result;
      }
      if (budget <= 0) break;
    }
  }
  for (const i of shuffle(
    indices.filter((i) => slots[i].length === theme.length),
    random,
  )) {
    budget = 2500;
    const start = domains.slice();
    start[i] = [theme];
    const result = search(indices, start, []);
    if (result) return result;
  }
}
export function draft(
  profile: string,
  theme: string,
  vocabulary: Map<string, number>,
  seed: number,
  corner: "left" | "right" = "left",
) {
  if (
    !["large", "train"].includes(profile) ||
    !Number.isSafeInteger(seed) ||
    !/^[A-ZÅÄÖ]{2,30}$/.test(theme)
  )
    throw Error("Invalid draft parameters");
  const random = seeded(seed);
  for (let attempt = 0; attempt < 120; attempt++) {
    const { slots, rect } = layout(profile === "large", random, corner),
      answer = fill(slots, theme, vocabulary, random);
    if (answer) {
      const entries: Entry[] = slots.map(([[x, y], [xx, yy]], i) => [
        answer[i],
        x,
        y,
        xx - x,
        yy - y,
      ]);
      validate(entries);
      return { entries, rect };
    }
  }
  throw Error(
    "Could not fill this grid. Try a different seed, vocabulary or theme.",
  );
}
