"""Build interlocking strips of words around the two illustrated answers."""

from collections import Counter
from functools import lru_cache
from itertools import product
import random

from engine import DIRECTIONS, inspect, locate_pictures, path


def support(entries):
    counts = Counter(cell for entry in entries for cell in path(entry))
    return [sum(counts[c] == 2 for c in path(e)) for e in entries], counts


def picture_starts(words, answers):
    """Two parallel picture entries, both crossing a longer theme entry."""
    first, second = answers
    for bridge in words:
        if len(bridge) < 8 or bridge in answers:
            continue
        for a, b in product(range(len(bridge)), repeat=2):
            if abs(a - b) < 3:
                continue
            for i in range(len(first)):
                for j in range(len(second)):
                    if first[i] == bridge[a] and second[j] == bridge[b]:
                        yield [
                            (bridge, 0, 0, 1, 0),
                            (first, a, -i, 0, 1),
                            (second, b, -j, 0, 1),
                        ]


def strips(words):
    by_length = {n: [w for w in words if len(w) == n] for n in (2, 3, 4)}

    @lru_cache(maxsize=2048)
    def fills(edge, side, depth):
        # Intersect each column's dictionary with the known edge letter.
        endings = []
        for char in edge:
            columns = [
                w for w in by_length[depth + 1] if w[0 if side == 1 else -1] == char
            ]
            endings.append({w[1:] if side == 1 else w[-2::-1] for w in columns})
        result = []
        for near in by_length[len(edge)]:
            tails = [
                {v[1:] for v in column if v[0] == c} for c, column in zip(near, endings)
            ]
            if not all(tails):
                continue
            for letters in product(*tails):
                far = "".join(letters)
                if far and far not in words:
                    continue
                rows = (near, far) if far else (near,)
                columns = tuple("".join(col)[::side] for col in zip(edge, *rows))
                if len(set((*rows, *columns))) == len(rows) + len(columns):
                    result.append((rows, columns))
        return result

    return fills


def additions(entries, fills, rng, recent):
    used = {e[0] for e in entries}
    letters, clues = inspect(entries)
    occupied = letters.keys() | clues
    for entry in entries:
        word, x, y, dx, dy = entry
        cells = path(entry)
        for width in (3, 2):
            for offset in range(len(word) - width + 1):
                start = cells[offset]
                for side in (-1, 1):
                    for depth in (2, 1):
                        # Test the complete geometry once before spelling the new rows.
                        def point(i, j):
                            return (
                                start[0] + dx * i + dy * j * side,
                                start[1] + dy * i + dx * j * side,
                            )

                        added = {
                            point(i, j)
                            for i in range(width)
                            for j in range(1, depth + 1)
                        }
                        if not added.isdisjoint(occupied):
                            continue

                        def block(rows, columns):
                            result = [
                                (w, *point(0, j), dx, dy) for j, w in enumerate(rows, 1)
                            ]
                            result.extend(
                                (w, *point(i, depth if side == -1 else 0), dy, dx)
                                for i, w in enumerate(columns)
                            )
                            return result

                        edge = word[offset : offset + width]
                        fake_rows = ["?" * width] * depth
                        fake_cols = ["".join(c)[::side] for c in zip(edge, *fake_rows)]
                        try:
                            inspect(entries + block(fake_rows, fake_cols))
                        except ValueError:
                            continue
                        choices = fills(edge, side, depth)
                        if not choices:
                            continue
                        for rows, cols in rng.sample(choices, min(8, len(choices))):
                            if used.isdisjoint((*rows, *cols)):
                                bonus = sum(len(w) >= 3 for w in (*rows, *cols))
                                novelty = sum(
                                    min(recent[w], 3) for w in (*rows, *cols)
                                ) / len((*rows, *cols))
                                yield (
                                    bonus + rng.uniform(0, 4) - novelty,
                                    block(rows, cols),
                                )
                                break


def generate_dense(words, answers, history, rng=None):
    rng = rng or random.Random()
    if len(answers) != 2:
        raise ValueError("Dense strips require two picture answers")
    starts = list(picture_starts(words, answers))
    recent = Counter(e[0] for p in history[-5:] for e in p["entries"])
    rng.shuffle(starts)
    starts.sort(key=lambda s: recent[s[0][0]])
    fills = strips(words)
    best = None
    for entries in starts[:80]:
        while len(entries) < 22:
            option = max(
                additions(entries, fills, rng, recent), key=lambda v: v[0], default=None
            )
            if option is None:
                break
            entries = entries + option[1]
        crossings, counts = support(entries)
        checked = sum(n == 2 for n in counts.values()) / len(counts)
        if len(entries) < 12 or min(crossings) < 2 or checked < 0.60:
            continue
        _, boxes = inspect(entries)
        xs, ys = zip(*(counts.keys() | boxes))
        grid = [[w, x - min(xs), y - min(ys), dx, dy] for w, x, y, dx, dy in entries]
        try:
            locate_pictures(grid, answers)
        except ValueError:
            continue
        area = (max(xs) - min(xs) + 1) * (max(ys) - min(ys) + 1)
        score = checked + (len(counts) + len(boxes)) / area
        if best is None or score > best[0]:
            best = score, grid
        if checked >= 0.83:
            break
    if best is None:
        raise ValueError(
            "Could not fill a dense grid with these picture answers and words"
        )
    return best[1]
