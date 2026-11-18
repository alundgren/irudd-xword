# Making a morning edition

Run `python3 app.py context --lang sv` privately to see earlier answers, positions and feedback. Use that history to change the subject, word mix, difficulty and clues. Free text such as “fewer names, more puns” is an editorial instruction for the author. Keep solutions and generation transcripts out of the player’s conversation. Use `--lang en` for English.

Start with `python3 app.py find --lang sv --pattern '?Ä?'` to look for possible crossings. The starter bank includes everyday words, people, places and original playful clues. Plain words can have pun clues too. Try the clue with a native speaker before giving an ambiguous pun a difficult crossing.

Generate an original PNG. Create a private JSON pack with:

- `generated_png` pointing to the image relative to the pack.
- `picture_answer` and `picture_clue` for its featured entry.
- `words` mapping uppercase answers (2–10 letters) to short clues. Use these to add proper nouns, invented expressions and fresh wordplay.
- Optional `layout`: `picture-first`, `side-by-side` or `grid-first`.
- Optional `entries`: an array of `[answer, x, y, dx, dy]`. Coordinates start at zero at the top left, and identify the first letter. Directions are right or down; the preceding square holds the clue. Supply a connected grid up to 40×40 including its picture answer. The checker rejects mismatched crossings, overlapping parallel words, repeated answers, covered clues and accidental runs. Omit this field for a procedural mini.

Run `python3 app.py generate --lang sv --pack path/to/edition.json`, then `python3 app.py validate --lang sv`. Reopen or reload the player for the new edition. Without a pack, generation reuses the bundled picture and varies the fill. Local records live in `~/.local/share/irudd-xword`; set `XWORD_DATA` to try a separate collection.

## Vocabulary sources to explore

- Swedish words and inflections: [SALDO from Språkbanken Text](https://spraakbanken.gu.se/resurser/saldo). Record the release, license and attribution for the particular export.
- English spelling candidates: [English Speller Database / SCOWL](https://wordlist.aspell.net/). Start with a common-word subset and retain the distribution’s copyright notices.
- People, fictional characters and places: [Wikidata structured data](https://www.wikidata.org/wiki/Wikidata:Licensing). Select Swedish and English labels and aliases by entity type. Keep the entity ID to distinguish people who share a name.
- Phrases and dad jokes: author them in the pack. Store the clue you intend to use with its exact answer. A dictionary can confirm letters; a test solver can tell you whether the joke lands.

These are candidate sources. The prototype bundles its own small bank. For live agent use, start with the CLI. An MCP adapter could later expose find, validate and publish while an open player listens for new editions.
