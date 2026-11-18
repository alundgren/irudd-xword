import {
  cells,
  directions,
  inspect,
  normalize,
  pictures,
  type Entry,
  type Words,
  type Cell,
} from "./grid";

export function shuffle<T>(items: T[], random = Math.random) {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}
function frequency(entries: Entry[]) {
  const counts = new Map<string, number>();
  for (const [w] of entries) counts.set(w, (counts.get(w) ?? 0) + 1);
  return (w: string) => counts.get(w) ?? 0;
}
function strips(words: Words) {
  const bank = Object.keys(words),
    cache = new Map<string, string[][]>();
  return (edge: string, side: number, depth: number) => {
    const key = [edge, side, depth].join(":");
    if (cache.has(key)) return cache.get(key)!;
    const result: string[][] = [];
    const inward = (s: string) => (side === 1 ? s : [...s].reverse().join(""));
    const columns = [...edge].map((ch) =>
      bank
        .filter((w) => w.length === depth + 1 && inward(w)[0] === ch)
        .map(inward),
    );
    for (const near of bank.filter((w) => w.length === edge.length)) {
      const allowed = columns.map((column, i) =>
        column.filter((w) => w[1] === near[i]),
      );
      if (allowed.some((options) => !options.length)) continue;
      const farRows =
        depth === 1
          ? [""]
          : bank.filter(
              (w) =>
                w.length === edge.length &&
                allowed.every((opts, i) => opts.some((col) => col[2] === w[i])),
            );
      for (const far of farRows) {
        const rows = far ? [near, far] : [near];
        const block = [
          ...rows,
          ...[...edge].map((c, i) =>
            inward(c + rows.map((w) => w[i]).join("")),
          ),
        ];
        if (new Set(block).size === block.length) result.push(block);
      }
    }
    cache.set(key, result);
    return result;
  };
}
function dense(words: Words, answers: string[], prior: Entry[]) {
  if (answers.length !== 2)
    throw Error("Dense fill requires two picture answers");
  const [first, second] = answers,
    starts: Entry[][] = [];
  const usage = frequency(prior);
  for (const bridge of Object.keys(words).filter(
    (w) => w.length >= 8 && !answers.includes(w),
  )) {
    for (let a = 0; a < bridge.length; a++)
      for (let b = 0; b < bridge.length; b++) {
        if (Math.abs(a - b) < 3) continue;
        for (let i = 0; i < first.length; i++)
          for (let j = 0; j < second.length; j++)
            if (bridge[a] === first[i] && bridge[b] === second[j])
              starts.push([
                [bridge, 0, 0, 1, 0],
                [first, a, -i, 0, 1],
                [second, b, -j, 0, 1],
              ]);
      }
  }
  const fills = strips(words);
  let best: Entry[] | undefined,
    bestScore = -Infinity;
  for (let entries of shuffle(starts)
    .sort((a, b) => usage(a[0][0]) - usage(b[0][0]))
    .slice(0, 80)) {
    while (entries.length < 22) {
      const used = new Set(entries.map((e) => e[0])),
        grid = inspect(entries);
      let next: Entry[] | undefined,
        score = -Infinity;
      for (const entry of entries) {
        const [word, , , dx, dy] = entry,
          positions = cells(entry);
        for (const width of [3, 2])
          for (let offset = 0; offset <= word.length - width; offset++)
            for (const side of [-1, 1])
              for (const depth of [2, 1]) {
                const [sx, sy] = positions[offset];
                const point = (i: number, j: number): Cell => [
                  sx + dx * i + dy * j * side,
                  sy + dy * i + dx * j * side,
                ];
                if (
                  Array.from({ length: width * depth }, (_, n) =>
                    String(point(n % width, 1 + Math.floor(n / width))),
                  ).some((k) => grid.occupied.has(k))
                )
                  continue;
                const block = (tokens: string[]): Entry[] =>
                  tokens.map((w, n) =>
                    n < depth
                      ? [w, ...point(0, n + 1), dx, dy]
                      : [
                          w,
                          ...point(n - depth, side === -1 ? depth : 0),
                          dy,
                          dx,
                        ],
                  );
                const edge = word.slice(offset, offset + width);
                const blank = [
                  ...Array(depth).fill("?".repeat(width)),
                  ...[...edge].map((ch) =>
                    side === 1
                      ? ch + "?".repeat(depth)
                      : "?".repeat(depth) + ch,
                  ),
                ];
                try {
                  inspect([...entries, ...block(blank)]);
                } catch {
                  continue;
                }
                const choices = fills(edge, side, depth);
                for (
                  let attempt = 0;
                  attempt < Math.min(8, choices.length);
                  attempt++
                ) {
                  const tokens =
                    choices[Math.floor(Math.random() * choices.length)];
                  if (tokens.some((w) => used.has(w))) continue;
                  const rank =
                    tokens.filter((w) => w.length >= 3).length +
                    Math.random() * 4 -
                    tokens.reduce((n, w) => n + Math.min(usage(w), 3), 0) /
                      tokens.length;
                  if (rank > score) {
                    score = rank;
                    next = block(tokens);
                  }
                  break;
                }
              }
      }
      if (!next) break;
      entries = [...entries, ...next];
    }
    const grid = inspect(entries);
    const fraction =
      [...grid.counts.values()].filter((n) => n === 2).length /
      grid.letters.size;
    if (
      entries.length < 12 ||
      fraction < 0.6 ||
      entries.some(
        (e) =>
          cells(e).filter((p) => grid.counts.get(String(p)) === 2).length < 2,
      )
    )
      continue;
    const normalized = normalize(entries);
    try {
      pictures(normalized, answers);
    } catch {
      continue;
    }
    const score = fraction + grid.occupied.size / (grid.width * grid.height);
    if (score > bestScore) {
      bestScore = score;
      best = normalized;
    }
    if (fraction >= 0.83) break;
  }
  if (!best) throw Error("Could not fit a dense grid with these words");
  return best;
}

export function generate(
  words: Words,
  anchor: string,
  answers: string[],
  useDense: boolean,
  prior: Entry[],
) {
  if (useDense) return dense(words, answers, prior);
  const usage = frequency(prior),
    limit = answers.length ? 18 : 12;
  let best: Entry[] | undefined,
    bestScore = -Infinity;
  for (let attempt = 0; attempt < 18; attempt++) {
    const entries: Entry[] = [
      [anchor, 0, 0, ...directions[Math.floor(Math.random() * 2)]],
    ];
    const used = new Set([anchor]);
    while (entries.length < (answers.length ? 15 : 10)) {
      const board = inspect(entries);
      let next: Entry | undefined,
        score = -Infinity;
      for (const w of Object.keys(words)) {
        if (used.has(w)) continue;
        for (const [key, ch] of board.letters) {
          const [cx, cy] = key.split(",").map(Number);
          for (let i = w.indexOf(ch); i !== -1; i = w.indexOf(ch, i + 1))
            for (const [dx, dy] of directions) {
              const e: Entry = [w, cx - i * dx, cy - i * dy, dx, dy];
              let grid;
              try {
                grid = inspect([...entries, e]);
              } catch {
                continue;
              }
              if (grid.width > limit || grid.height > limit) continue;
              let rank =
                Math.random() * 5 - (grid.width * grid.height) / 30 - usage(w);
              if (answers.includes(w)) rank += 100;
              if (
                answers.length &&
                w.length >= 8 &&
                [...used].filter((v) => v.length >= 8).length < 2
              )
                rank += 12;
              if (rank > score) {
                score = rank;
                next = e;
              }
            }
        }
      }
      if (!next) break;
      entries.push(next);
      used.add(next[0]);
    }
    const grid = inspect(entries),
      normalized = normalize(entries);
    try {
      pictures(normalized, answers);
    } catch {
      continue;
    }
    const score = 1000 * entries.length - grid.width * grid.height;
    if (score > bestScore) {
      bestScore = score;
      best = normalized;
    }
  }
  if (!best) throw Error("Could not fit the picture answers");
  return best;
}
