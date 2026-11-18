# Irudd Xword

The local Python process owns crossword construction, solution checking and SQLite. Keep answers, private artwork, guesses and feedback in the local data directory. Send the player only clue text, placement, generated pictures and the player’s own progress.

The desktop process starts the loopback player and opens a sandboxed Electrobun window. The React view renders allowed layouts decoded with Effect Schema. UI SDK handles spatial navigation and pending actions. Each edition is data. Do not execute agent-authored HTML or scripts.

Read AUTHORING.md for the edition contract. Preserve existing SQLite editions when extending it. Run bun run check and bun run build locally before publishing. GUI tests require an isolated desktop.

For grid rendering changes or new puzzle editions, follow the WebKit render check in AUTHORING.md. Inspect the screenshots as well as the overflow report.
