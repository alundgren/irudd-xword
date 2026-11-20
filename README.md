# Irudd Xword

A local morning picture crossword for Swedish and English. Play a generated edition in an Electrobun window, check individual letters, and leave a note for whoever makes tomorrow’s puzzle. Puzzle artwork is generated. The bundled illustration and starter clues were created for this prototype.

## Run on macOS

Install Bun. From the repository root run:

```sh
bun install --frozen-lockfile
bun run desktop
```

Click an arrow clue to select its entry. Typing advances along the answer. Use the arrow keys to move between letter cells in the same row or column, including across gaps. Check and feedback controls use UI SDK’s pending button behavior. Guesses and feedback are stored per edition in SQLite.

For local browser play, run `bun run build:view` and `bun run xword serve --port 8766`, then open http://127.0.0.1:8766. Run `bun run check` for local tests and `bun run build` for the desktop bundle. Electrobun downloads its toolchain during the first build. The installed app includes Bun and the authoring CLI.

[Generating editions and finding words](AUTHORING.md) · [Project conventions](AGENTS.md) · [MIT license](LICENSE)

Publish an authored edition with `bun run xword generate --pack PATH`. For newspaper drafts and private packs, use `bun run xword --help`. The installed macOS bundle also supports the CLI with its included runtime:

```sh
app="$HOME/Applications/Morgonkryss.app/Contents"
"$app/MacOS/bun" "$app/Resources/app/player/xword.js" --help
```

In the player, **Utgåvans stil** lets you try Krittavla, Verkstadsritning and Tidningspapper as you solve. For dated puzzles, `bun run xword brief --day YYYY-MM-DD` reads recent feedback and suggests the clue voice, page and picture composition. See the [constructor notes and style controls](AUTHORING.md#vary-the-next-edition).
