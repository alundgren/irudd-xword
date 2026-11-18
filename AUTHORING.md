# Making a morning edition

Run `python3 app.py context --lang sv` privately to see earlier answers, positions and feedback. Use that history to change the subject, word mix, difficulty and clues. Free text such as “fewer names, more puns” is an editorial instruction for the author. Keep solutions and generation transcripts out of the player’s conversation. Use `--lang en` for English.

Start with `python3 app.py find --lang sv --pattern '?Ä?'` to look for possible crossings. The starter bank includes everyday words, people, places and original playful clues. Plain words can have pun clues too. Try the clue with a native speaker before giving an ambiguous pun a difficult crossing.

Generate an original PNG. Create a private JSON pack with:

- `generated_png` pointing to the image relative to the pack.
- `picture_answer` and `picture_clue` for its featured entry.
- `words` mapping uppercase answers (2–30 letters) to short clues. Use these to add proper nouns, invented expressions and fresh wordplay.
- Optional `layout`: `picture-first`, `side-by-side` `grid-first` or `illustrated-grid`. The illustrated grid places the primary image inside the crossword and accepts an optional `extra_pictures` array. Each object supplies its own `generated_png`, `answer` and `clue`. Every numbered picture must fit in a free rectangle and its answer must appear in the connected fill.
- Optional `entries`: an array of `[answer, x, y, dx, dy]`. Coordinates start at zero at the top left, and identify the first letter. Directions are right or down; the preceding square holds the clue. Supply a connected grid up to 40×40 including its picture answer. The checker rejects mismatched crossings, overlapping parallel words, repeated answers, covered clues and accidental runs. Omit this field for a procedural mini.

Run `python3 app.py generate --lang sv --pack path/to/edition.json`, then `python3 app.py validate --lang sv`. Reopen or reload the player for the new edition. Swedish is the default. Its bundled coastal pack makes two numbered picture clues and favours a mix of short and long answers. English keeps its single-picture mini. Custom packs in either language can use the illustrated grid. Local records live in `~/.local/share/irudd-xword`; set `XWORD_DATA` to try a separate collection.

## Vocabulary sources to explore

- Swedish words and inflections: [SALDO from Språkbanken Text](https://spraakbanken.gu.se/resurser/saldo). Record the release, license and attribution for the particular export.
- English spelling candidates: [English Speller Database / SCOWL](https://wordlist.aspell.net/). Start with a common-word subset and retain the distribution’s copyright notices.
- People, fictional characters and places: [Wikidata structured data](https://www.wikidata.org/wiki/Wikidata:Licensing). Select Swedish and English labels and aliases by entity type. Keep the entity ID to distinguish people who share a name.
- Phrases and dad jokes: author them in the pack. Store the clue you intend to use with its exact answer. A dictionary can confirm letters; a test solver can tell you whether the joke lands.

These are candidate sources. The prototype bundles its own small bank. For live agent use, start with the CLI. An MCP adapter could later expose find, validate and publish while an open player listens for new editions.

## What Swedish constructors and their tools suggest

Mats Edvardsson describes deciding the picture and highlighted theme entries early, weaving crossing words around them, reserving room for clue cells and writing the short clues after the grid works. He keeps a separate solution. In this prototype the picture answers are prioritized during construction, then each illustration is fitted into a free rectangle near its clue. [Edvardsson in Motorföraren, p. 21](https://www.mhf.se/app/uploads/2023/11/Motorfo%CC%88raren-nr-7-2023.pdf#page=21)

Bengt Carlson describes starting with two long entries and limiting clusters of clue cells to keep the solver moving through the grid. A familiar answer can still be challenging through its clue. For playtesting, look for stretches where a long answer has too few helpful crossings. [Constructor interview in Språktidningen](https://spraktidningen.se/artiklar/kors-vilket-lyft-hjarnan/)

Crossword Compiler gives pictures whole-cell rectangular footprints. Its clue cells can split, wrap text and explicitly assign arrows to answers, including corner arrows. Explicit arrow routing and highlighted picture phrases would be worthwhile experiments after testing the current straight-arrow version. [Picture placement](https://crossword-compiler.com/en/help/html/addingimagestoapuzzle.htm) · [Clue cells](https://www.crossword-compiler.com/en/help/html/cluesquares.htm)
