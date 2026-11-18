# Irudd Xword

A local morning picture crossword for Swedish and English. Play a generated edition in an Electrobun window, check individual letters, and leave a note for whoever makes tomorrow’s puzzle. Puzzle artwork is generated. The bundled illustration and starter clues were created for this prototype.

## Run on macOS

Install Bun and Python 3.9 or later. From the repository root run:

```sh
bun install --frozen-lockfile
python3 app.py generate --lang en
python3 app.py generate --lang sv
bun run desktop
```

Click an arrow clue to select its entry. Typing advances along the answer. Use the arrow keys to move between letter cells in the same row or column, including across gaps. Check and feedback controls use UI SDK’s pending button behavior. Guesses and feedback are stored per edition in SQLite.

For local browser play, run `bun run build:view` and `python3 app.py serve --port 8766`, then open http://127.0.0.1:8766. Run `bun run check` for local tests and `bun run build` for the desktop bundle. Electrobun downloads its toolchain during the first build. Python is required at runtime.

[Generating editions and finding words](AUTHORING.md) · [Project conventions](AGENTS.md) · [MIT license](LICENSE)
