# Making a morning edition

Run `bun run xword context --lang sv` privately to see earlier answers, positions and feedback. Use that history to change the subject, word mix, difficulty and clues. Free text such as “fewer names, more puns” is an editorial instruction for the author. Keep solutions and generation transcripts out of the player’s conversation. Use `--lang en` for English.

Start with `bun run xword find --lang sv --pattern '?Ä?'` to look for possible crossings. The starter bank includes everyday words, people, places and original playful clues. Plain words can have pun clues too. Try the clue with a native speaker before giving an ambiguous pun a difficult crossing.

Generate an original PNG. Create a private JSON pack with:

- `generated_png` pointing to the image relative to the pack.
- `picture_answer` and `picture_clue` for its featured entry.
- `words` mapping uppercase answers (2–30 letters) to short clues. Use these to add proper nouns, invented expressions and fresh wordplay.
- Optional `layout`: `picture-first`, `side-by-side` `grid-first` or `illustrated-grid`. The illustrated grid places the primary image inside the crossword and accepts an optional `extra_pictures` array. Each object supplies its own `generated_png`, `answer` and `clue`. Every numbered picture must fit in a free rectangle and its answer must appear in the connected fill.
- Required `entries`: an array of `[answer, x, y, dx, dy]`. Coordinates start at zero at the top left, and identify the first letter. Directions are right or down; the preceding square holds the clue. Supply a connected grid up to 40×40 including its picture answer. The checker rejects mismatched crossings, overlapping parallel words, repeated answers, covered clues and accidental runs.

Run `bun run xword generate --lang sv --pack path/to/edition.json`, then `bun run xword validate --lang sv`. Reopen or reload the player for the new edition. Swedish is the default. Local records live in `~/.local/share/irudd-xword`; set `XWORD_DATA` to try a separate collection.

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

## Vary the next edition

Tobias Burnesson describes choosing a theme and picture, laying a word or phrase into the grid, then weaving the crossings. His weekly subjects include local calendar events. For our morning editions, choose a scene someone could recognize this week. For the train edition, one object and one quick insight can carry the whole picture. [Burnesson in Landskrona Direkt](https://www.landskronadirekt.com/2020/01/31/ett-jobb-pa-kors-och-tvars/)

Maria Argiroudaki describes the work of fitting a short, funny, fresh clue into a little square. Her family also recalls a replacement illustration that broke a puzzle's joke. Write down the detail that makes the clue fair before generating the picture. Inspect that detail in the actual grid crop. A beautiful drawing of the wrong moment needs another pass. [Constructor interview in Språktidningen](https://spraktidningen.se/okategoriserade/tre-generationer-ratt-i-krysset/)

Lena Holmlund uses a question mark to tell the solver to try another reading. An original example for a practice grid is *Har blad i vattnet* for ÅRA on an observational day and *Har blad utan att växa?* on a playful one. Put a direct clue through one of its useful letters so the solver can discover the joke through crossings. [Holmlund in Arbetet](https://arbetet.se/2020/09/18/lena-holmlund-kan-korsordets-abc/)

Run `bun run xword brief --day YYYY-MM-DD` before choosing the picture. It returns a repeatable starting point and the six most recent editions up through that date, including their private editorial notes and solver feedback. Read `context` if you also need the past answer lists. Use the feedback to choose what to repeat or change. For example, “I liked the jokes but got stuck on the names” is a reason to keep the playful voice and give a name two familiar crossings. Keep a sentence in the pack's optional `editorial_note` recording which subject, picture detail and clue device you actually used. The player does not display this note.

| Authoring choice | What to try |
| --- | --- |
| Clue voice | `classic` mixes concise definitions and familiar names. `fieldnotes` uses an observable detail or action. `wordplay` introduces a second meaning among direct entry points. Review the individual keys in all three. |
| Paper and lettering | `newsprint` uses a warm page and serif masthead. `chalk` uses a slate board and rounded Krysskrita capitals. `mechanical` uses drafting rules and angular Rutverk capitals. Compact clues use system type for legibility. The original display fonts include A–Z, ÅÄÖ and digits. Rebuild from their stroke drawings with `bun run build:fonts`. |
| Picture composition | Try an object, an action, a relationship between two subjects, or a recognizable place. The daily brief proposes a composition and medium. For an authored picture use `generated_png`, with an optional `art_by_paper` map of alternative generated PNGs showing the same subject. |
| Grid | A dated newspaper draft can reserve its picture in either upper corner. Test a different seed for new connections and word lengths. Compare the least-crossed answer and where easy starting clues sit on the page. |

Pass `--day`, `--voice`, `--paper` and `--corner` to `draft` to try a combination, for example `--voice wordplay --paper chalk --corner right`. The draft stores its settings, actual picture rectangle and suggested clues. Open the player's **Tryckstil** menu to preview the same puzzle on another paper. Previewing preserves the answers, artwork and saved progress.

## Check the rendered edition

With Docker running and the local player serving editions, run `bun run render:check 6` (replace 6 with the saved edition ID). It rebuilds the current view, reads the edition from port 8766, then renders a blank copy with WebKit inside a Linux container. The first run downloads the matching Playwright image. Use `--port 8765` for a player on another port, or `--widths 390 980` to choose viewport widths in CSS pixels.

The command writes a full-page PNG per width and `report.json` in `artifacts/render-<id>/`. Use `--output PATH` for a separate comparison. A clipped clue, arrow or overlapping split button produces a nonzero exit. The report gives the clue text, grid column and row (both one-based), and the affected half of a split. The check measures every clue, including cells beyond the visible scroll area. Inspect the PNGs for awkward wrapping and crowded rows even when the geometry passes. Shorten an awkward clue and repeat before handing the puzzle to the solver. Screenshots exclude saved guesses and feedback.

For the two newspaper sizes, follow the [morning crossword authoring skill](.agents/skills/morning-crosswords/SKILL.md). A named pack can set an ISO `edition_day`, a spoiler-free `title` and a single `picture_rect` in cell units. The player accepts `?edition=ID` links. Reusing a title for the same language and day is rejected to protect saved progress.
