import random
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIRECTIONS = [(1, 0), (0, 1)]


def bank(lang):
    rows = (line.split('\t') for line in (ROOT / 'words.tsv').read_text().splitlines())
    return {word: clue for language, word, clue in rows if language == lang}


def path(entry):
    word, x, y, dx, dy = entry
    return [(x + dx*i, y + dy*i) for i in range(len(word))]


def inspect(entries):
    letters, boxes, edges = {}, set(), set()
    for word, x, y, dx, dy in entries:
        boxes.add((x-dx, y-dy))
        cells = path((word, x, y, dx, dy))
        for pos, char in zip(cells, word):
            if letters.setdefault(pos, char) != char:
                raise ValueError('crossing mismatch')
        for edge in zip(cells, cells[1:]):
            if edge in edges:
                raise ValueError('parallel overlap')
            edges.add(edge)
    if boxes.intersection(letters):
        raise ValueError('clue overlaps letter')
    for x, y in letters:
        for dx, dy in DIRECTIONS:
            nxt = (x+dx, y+dy)
            if nxt in letters and ((x, y), nxt) not in edges:
                raise ValueError('unclued adjacent letters')
    return letters, boxes


def generate(lang, history, rng=None, words=None, picture_answers=()):
    rng = rng or random.Random()
    words = words or bank(lang)
    anchor = next(iter(words))
    frequency = Counter(e[0] for p in history for e in p['entries'])
    illustrated = bool(picture_answers)
    limit = 18 if illustrated else 12
    best = None
    for attempt in range(18):
        entries = [(anchor, 0, 0, *rng.choice(DIRECTIONS))]
        used = {anchor}
        while len(entries) < (15 if illustrated else 10):
            letters, boxes = inspect(entries)
            options = []
            for word in words.keys() - used:
                for index, char in enumerate(word):
                    for (x, y), other in letters.items():
                        if char != other:
                            continue
                        for dx, dy in DIRECTIONS:
                            candidate = (word, x-index*dx, y-index*dy, dx, dy)
                            try:
                                new, clues = inspect([*entries, candidate])
                            except ValueError:
                                continue
                            xs, ys = zip(*(new.keys() | clues))
                            w, h = max(xs)-min(xs)+1, max(ys)-min(ys)+1
                            if w <= limit and h <= limit:
                                score = rng.uniform(0, 5) - w*h/30 - frequency[word]
                                if illustrated:
                                    if word in picture_answers:
                                        score += 100
                                    if len(word) >= 8 and sum(len(v) >= 8 for v in used) < 2:
                                        score += 12
                                    if len(word) <= 3 and all(len(v) > 3 for v in used):
                                        score += 8
                                options.append((score, candidate))
            if not options:
                break
            candidate = max(options)[1]
            entries.append(candidate)
            used.add(candidate[0])
        letters, boxes = inspect(entries)
        xs, ys = zip(*(letters.keys() | boxes))
        score = (len(entries), -(max(xs)-min(xs)+1)*(max(ys)-min(ys)+1))
        if illustrated:
            if not set(picture_answers) <= used:
                continue
            try:
                locate_pictures([[w,x-min(xs),y-min(ys),dx,dy] for w,x,y,dx,dy in entries], picture_answers)
            except ValueError:
                continue
            score = (len(entries), len({len(w) for w in used}), score[1])
        if best is None or score > best[0]:
            best = score, entries, min(xs), min(ys)
    if best is None:
        raise ValueError("Could not fit the picture clues; try different words or author the grid")
    _, entries, left, top = best
    return [[w, x-left, y-top, dx, dy] for w, x, y, dx, dy in entries]


def check_layout(entries, words):
    """Check a finished grid, including coordinates supplied by an author."""
    if not 2 <= len(entries) <= 100:
        raise ValueError('A puzzle needs 2–100 entries')
    used = set()
    for word, x, y, dx, dy in entries:
        if word not in words or word in used or (dx, dy) not in DIRECTIONS:
            raise ValueError('Unknown or repeated answer, or invalid direction')
        used.add(word)
        if any(type(n) is not int for n in (x, y, dx, dy)):
            raise ValueError('Grid coordinates must be integers')
    letters, clues = inspect(entries)
    if any(not (0 <= x < 40 and 0 <= y < 40) for x, y in letters.keys() | clues):
        raise ValueError('Grid exceeds 40 by 40 or begins outside the page')
    connected = set(path(entries[0]))
    remaining = [set(path(entry)) for entry in entries[1:]]
    while remaining:
        for cells in remaining:
            if connected.intersection(cells):
                connected.update(cells)
                remaining.remove(cells)
                break
        else:
            raise ValueError('Every entry must connect through a crossing')


def locate_pictures(entries, answers):
    """Fit image rectangles inside the grid and near their respective clues."""
    letters, clues = inspect(entries)
    occupied = letters.keys() | clues
    right = max(x for x, _ in occupied) + 1
    bottom = max(y for _, y in occupied) + 1
    results = []
    for answer in answers:
        entry = next((e for e in entries if e[0] == answer), None)
        if entry is None:
            raise ValueError('Every picture needs an answer in the grid')
        _, col, row, dx, dy = entry
        candidates = []
        for w, h in [(3, 3), (4, 2), (3, 2), (2, 3), (2, 2)]:
            for y in range(bottom-h+1):
                for x in range(right-w+1):
                    rectangle = {(i,j) for i in range(x,x+w) for j in range(y,y+h)}
                    if occupied.isdisjoint(rectangle):
                        distance = min(abs(i-col+dx)+abs(j-row+dy) for i,j in rectangle)
                        candidates.append((distance-w*h/3, y, x, w, h))
        if not candidates:
            raise ValueError('No empty rectangle for the picture')
        _, y, x, w, h = min(candidates)
        occupied.update((i,j) for i in range(x,x+w) for j in range(y,y+h))
        results.append([x,y,w,h])
    return results
