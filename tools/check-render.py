"""Render one saved edition in an isolated browser and report clue overflows."""
import argparse
import json
from pathlib import Path
import subprocess
import tempfile
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("edition", type=int)
parser.add_argument("--port", type=int, default=8766, help="Local player port")
parser.add_argument("--widths", nargs="+", type=int, default=[390, 768, 980])
parser.add_argument("--output", type=Path)
args = parser.parse_args()
if any(w < 240 or w > 3840 for w in args.widths):
    parser.error("Viewport widths must be between 240 and 3840")


def read(path):
    with urlopen(f"http://127.0.0.1:{args.port}/{path}", timeout=10) as response:
        return response.read()


out = (args.output or ROOT / "artifacts" / f"render-{args.edition}").resolve()
out.mkdir(parents=True, exist_ok=True)
version = json.loads((ROOT / "node_modules/playwright-core/package.json").read_text())["version"]
with tempfile.TemporaryDirectory(dir=out.parent) as temp:
    snapshot = Path(temp)
    rows = [row for row in json.loads(read("editions")) if row[0] == args.edition]
    if not rows:
        parser.error(f"Edition {args.edition} is missing on port {args.port}")
    puzzle = json.loads(read(f"p/{args.edition}"))
    puzzle.update(guesses={}, feedback="")
    (snapshot / "edition.json").write_text(json.dumps(puzzle))
    (snapshot / "editions.json").write_text(json.dumps(rows))
    for panel in puzzle.get("panels", []):
        slot = panel["slot"]
        (snapshot / f"panel-{slot}.png").write_bytes(read(f"panel/{args.edition}/{slot}"))
    if puzzle["layout"] != "illustrated-grid":
        (snapshot / "picture.png").write_bytes(read(f"image/{args.edition}"))
    # Only blank player data and the renderer enter the Linux browser container.
    command = ["docker", "run", "--rm", "--init", "--network", "none"]
    for src, dest in [(snapshot, "data"), (ROOT / "tools/render.mjs", "render.mjs"),
                      (ROOT / "dist/layout.js", "layout.js"), (ROOT / "index.html", "index.html"),
                      (ROOT / "node_modules/playwright-core", "node_modules/playwright-core")]:
        command += ["-v", f"{src}:/check/{dest}:ro"]
    command += ["-v", f"{out}:/out", f"mcr.microsoft.com/playwright:v{version}-noble",
                "node", "/check/render.mjs", *map(str, args.widths)]
    status = subprocess.run(command).returncode
print(f"Render artifacts: {out}")
raise SystemExit(status)
