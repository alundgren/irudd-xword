"""Prepare private, connected Swedish newspaper layouts from ranked vocabulary."""

import argparse
from collections import defaultdict
import json
from pathlib import Path
import random
import re
import sys
from collections import Counter

from engine import bank, check_layout, inspect, path, picture_cells


def layout(profile, rng):
    widths, heights, reserve = (
        ([3, 4, 3, 3], [3, 3, 3, 3, 2], 2)
        if profile == "large"
        else ([3, 3], [2, 3, 2], 1)
    )

    def offsets(sizes):
        return [sum(sizes[:i]) + i for i in range(len(sizes))]

    xs, ys = offsets(widths), offsets(heights)
    rooms = {
        (i, j)
        for i in range(len(xs))
        for j in range(len(ys))
        if i >= reserve or j >= reserve
    }
    cells = {
        (xs[i] + x, ys[j] + y)
        for i, j in rooms
        for x in range(1, widths[i] + 1)
        for y in range(1, heights[j] + 1)
    }
    # Open one passage between neighbouring blocks so across/down answers
    # connect the entire page. Randomize the spanning tree for each edition.
    edges = [
        (room, other)
        for room in sorted(rooms)
        for other in [(room[0] + 1, room[1]), (room[0], room[1] + 1)]
        if other in rooms
    ]
    rng.shuffle(edges)
    groups = {room: {room} for room in rooms}
    for (i, j), (k, l) in edges:
        left, right = groups[i, j], groups[k, l]
        if left is right:
            continue
        group = left | right
        for r in group:
            groups[r] = group
        if j == l:
            cells.add((xs[k], ys[j] + rng.randint(1, heights[j])))
        else:
            cells.add((xs[i] + rng.randint(1, widths[i]), ys[l]))
    slots = []
    for x, y in sorted(cells):
        for dx, dy in [(1, 0), (0, 1)]:
            if (x - dx, y - dy) in cells:
                continue
            run = []
            while (x + len(run) * dx, y + len(run) * dy) in cells:
                run.append((x + len(run) * dx, y + len(run) * dy))
            if len(run) >= 2:
                slots.append(run)
    return slots, [0, 0, xs[reserve], ys[reserve]]


def fill(slots, theme, vocabulary, rng):
    sizes = {len(s) for s in slots}
    indexed = defaultdict(set)
    by_size = defaultdict(list)
    for w in vocabulary:
        if len(w) in sizes:
            by_size[len(w)].append(w)
            for i, c in enumerate(w):
                indexed[len(w), i, c].add(w)
    domains = [set(by_size[len(slot)]) for slot in slots]
    possible = [i for i, s in enumerate(slots) if len(s) == len(theme)]
    if not possible or not all(domains):
        return
    rng.shuffle(possible)
    occupants = defaultdict(list)
    for i, s in enumerate(slots):
        for k, cell in enumerate(s):
            occupants[cell].append((i, k))
    neighbors = [
        [(j, k, l) for k, c in enumerate(s) for j, l in occupants[c] if i != j]
        for i, s in enumerate(slots)
    ]
    budget = 2500

    def search(remaining, chosen, domains):
        nonlocal budget
        if not remaining:
            return chosen
        if budget <= 0:
            return
        budget -= 1
        i = min(remaining, key=lambda n: (len(domains[n]), -len(neighbors[n]), n))
        rest = remaining - {i}
        candidates = sorted(domains[i], key=lambda w: (vocabulary[w], w))
        order = sorted(
            candidates, key=lambda w: vocabulary[w] + rng.expovariate(1 / 800)
        )
        for w in order[:60]:
            following = domains.copy()
            for j in rest:
                if w in following[j]:
                    following[j] = following[j] - {w}
            for j, k, l in neighbors[i]:
                if j in rest:
                    following[j] = following[j] & indexed[len(slots[j]), l, w[k]]
            if all(following[j] for j in rest):
                answer = search(rest, {**chosen, i: w}, following)
                if answer:
                    return answer
            if budget <= 0:
                break

    for anchor in possible:
        budget = 2500
        initial = domains.copy()
        initial[anchor] = {theme}
        result = search(set(range(len(slots))), {}, initial)
        if result:
            return result
    return None


def draft(profile, theme, vocabulary, rng):
    for _ in range(120):
        slots, rect = layout(profile, rng)
        result = fill(slots, theme, vocabulary, rng)
        if result:
            entries = []
            for i, s in enumerate(slots):
                (x, y), (xx, yy) = s[:2]
                entries.append([result[i], x, y, xx - x, yy - y])
            check_layout(entries, vocabulary)
            return entries, rect
    raise ValueError("No fill found. Try a different seed, vocabulary or theme answer.")


def inspect_pack(pack):
    entries = pack["entries"]
    words = {**pack["words"], pack["picture_answer"]: pack["picture_clue"]}
    check_layout(entries, words)
    counts = Counter(cell for entry in entries for cell in path(entry))
    letters, boxes = inspect(entries)
    cells = letters.keys() | boxes
    width = max(x for x, y in cells) + 1
    height = max(y for x, y in cells) + 1
    photo = picture_cells(entries, pack["picture_rect"])
    missing = sum(not words[e[0]].strip() for e in entries)
    return dict(
        width=width,
        height=height,
        entries=len(entries),
        occupied=len(cells | photo),
        page_cells=width * height,
        shared=sum(n == 2 for n in counts.values()),
        letters=len(counts),
        minimum_crossings=min(sum(counts[c] == 2 for c in path(e)) for e in entries),
        missing_clues=missing,
    )


if __name__ == "__main__":
    if sys.argv[1:2] == ["inspect"]:
        parser = argparse.ArgumentParser(
            description="Inspect a private newspaper draft without exposing answers"
        )
        parser.add_argument("pack", type=Path)
        report = inspect_pack(
            json.loads(parser.parse_args(sys.argv[2:]).pack.read_text())
        )
        print(json.dumps(report))
        raise SystemExit(bool(report["missing_clues"]))
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("profile", choices=["large", "train"])
    cli.add_argument(
        "--words", type=Path, required=True, help="Ranked UTF-8 words, one per line"
    )
    cli.add_argument("--answer", required=True)
    cli.add_argument(
        "--image", required=True, help="Generated PNG relative to the output pack"
    )
    cli.add_argument("--output", type=Path, required=True)
    cli.add_argument("--seed", type=int, required=True)
    cli.add_argument("--avoid", type=Path, help="Words to exclude, one per line")
    args = cli.parse_args()
    known = bank("sv")
    vocab = {w: 1000 for w in known}
    for rank, line in enumerate(args.words.read_text().splitlines()):
        w = line.upper().strip()
        if len(w) >= 3 and re.fullmatch("[A-ZÅÄÖ]+", w):
            vocab.setdefault(w, rank + 3000)
    if args.avoid:
        for w in args.avoid.read_text().upper().splitlines():
            vocab.pop(w.strip(), None)
    theme = args.answer.upper()
    vocab[theme] = 0
    entries, rect = draft(args.profile, theme, vocab, random.Random(args.seed))
    pack = dict(
        layout="illustrated-grid",
        generated_png=args.image,
        picture_answer=theme,
        picture_clue="",
        picture_rect=rect,
        entries=entries,
        words={e[0]: known.get(e[0], "") for e in entries if e[0] != theme},
    )
    with args.output.open("x") as f:
        json.dump(pack, f, indent=2, ensure_ascii=False)
    print(f"Private draft ready: {len(entries)} entries")
