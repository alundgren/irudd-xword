// Original centre lines for display capitals. Each point is a grid coordinate
// written as xy, with y increasing from the cap line towards the baseline.
import opentype from "opentype.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const strokes: Record<string, string> = {
  A: "09 30 69 / 16 56",
  B: "09 00 40 51 53 44 04 / 44 65 68 59 09",
  C: "61 50 20 01 08 19 49 68",
  D: "09 00 30 51 62 67 58 39 09",
  E: "60 00 09 69 / 04 44",
  F: "09 00 60 / 04 44",
  G: "61 50 20 01 08 19 49 68 65 35",
  H: "00 09 / 60 69 / 04 64",
  I: "00 40 / 20 29 / 09 49",
  J: "20 60 67 58 49 29 08 07",
  K: "00 09 / 60 05 / 24 69",
  L: "00 09 59",
  M: "09 00 35 60 69",
  N: "09 00 69 60",
  O: "20 40 61 68 49 29 08 01 20",
  P: "09 00 40 61 64 45 05",
  Q: "20 40 61 67 49 29 08 01 20 / 46 69",
  R: "09 00 40 61 63 44 04 / 34 69",
  S: "61 50 20 01 03 14 55 66 68 59 19 08",
  T: "00 60 / 30 39",
  U: "00 07 19 49 68 60",
  V: "00 39 60",
  W: "00 19 35 59 60",
  X: "00 69 / 60 09",
  Y: "00 34 60 / 34 39",
  Z: "00 60 09 69",
  "0": "20 40 61 68 49 29 08 01 20 / 16 53",
  "1": "02 20 29 / 09 49",
  "2": "01 20 40 61 63 09 69",
  "3": "01 20 40 61 63 44 24 / 44 65 68 59 19 08",
  "4": "50 05 65 / 50 59",
  "5": "60 00 04 44 65 68 59 19 08",
  "6": "60 30 12 03 08 19 49 68 65 54 24 05",
  "7": "00 60 19",
  "8": "20 40 61 63 44 24 03 01 20 / 24 05 08 19 59 68 65 44",
  "9": "65 24 14 03 01 20 40 61 67 49 19",
};
type Point = [number, number];

function buildFont(chalk: boolean) {
  const family = chalk ? "Krysskrita" : "Rutverk";
  const glyphs = [
    new opentype.Glyph({
      name: ".notdef",
      advanceWidth: 500,
      path: new opentype.Path(),
    }),
    new opentype.Glyph({
      name: "space",
      unicode: 32,
      advanceWidth: 280,
      path: new opentype.Path(),
    }),
  ];
  for (const character of [...Object.keys(strokes), "Å", "Ä", "Ö"]) {
    const base =
      character === "Ö" ? "O" : "ÅÄ".includes(character) ? "A" : character;
    const path = new opentype.Path();
    const radius = chalk ? 36 : 39;
    const unitX = chalk ? 85 : 74;
    const point = (x: number, y: number): Point => [
      58 + x * unitX + (chalk ? 3 * (9 - y) + 5 * Math.sin(y * 1.8 + x) : 0),
      700 - y * 77 + (chalk ? 7 * Math.sin(x * 1.4 + y) : 0),
    ];
    function polygon(points: Point[]) {
      const [[x, y], ...rest] = points;
      path.moveTo(Math.round(x), Math.round(y));
      for (const [px, py] of rest) path.lineTo(Math.round(px), Math.round(py));
      path.close();
    }
    const dot = ([x, y]: Point, r: number) =>
      polygon(
        Array.from({ length: chalk ? 12 : 8 }, (_, i): Point => {
          const angle = (-2 * Math.PI * i) / (chalk ? 12 : 8);
          return [x + r * Math.cos(angle), y + r * Math.sin(angle)];
        }),
      );
    function stroke(points: Point[], r = radius) {
      for (const p of points) dot(p, r);
      for (let i = 1; i < points.length; i++) {
        const [x, y] = points[i - 1],
          [xx, yy] = points[i];
        const length = Math.hypot(xx - x, yy - y);
        const dx = ((y - yy) / length) * r,
          dy = ((xx - x) / length) * r;
        polygon([
          [x + dx, y + dy],
          [xx + dx, yy + dy],
          [xx - dx, yy - dy],
          [x - dx, y - dy],
        ]);
      }
    }
    const lines = strokes[base]
      .split(" / ")
      .map((line) =>
        line.split(" ").map((pair) => point(Number(pair[0]), Number(pair[1]))),
      );
    for (const line of lines) {
      if (!chalk || line.length <= 2) {
        stroke(line);
        continue;
      }
      // Round the turns made by a moving piece of chalk. The drafting face
      // keeps the straight cuts at each corner.
      const rounded: Point[] = [line[0]];
      for (let i = 1; i < line.length - 1; i++) {
        const previous = line[i - 1],
          bend = line[i],
          next = line[i + 1];
        const towards = (other: Point): Point => {
          const distance = Math.hypot(other[0] - bend[0], other[1] - bend[1]);
          const fraction = Math.min(0.32, 80 / distance);
          return [
            bend[0] + (other[0] - bend[0]) * fraction,
            bend[1] + (other[1] - bend[1]) * fraction,
          ];
        };
        const start = towards(previous),
          end = towards(next);
        for (const t of [0, 0.25, 0.5, 0.75, 1]) {
          const u = 1 - t;
          rounded.push(
            [0, 1].map(
              (a) => u * u * start[a] + 2 * u * t * bend[a] + t * t * end[a],
            ) as Point,
          );
        }
      }
      rounded.push(line.at(-1)!);
      stroke(rounded);
    }
    if (character === "Å") {
      const ring = Array.from({ length: 13 }, (_, i): Point => {
        const angle = (i * Math.PI) / 6;
        return point(
          3 + 0.78 * Math.cos(angle),
          -1.75 + 0.78 * Math.sin(angle),
        );
      });
      stroke(ring, 22);
    }
    if ("ÄÖ".includes(character)) {
      dot(point(1.6, -1.6), 42);
      dot(point(4.4, -1.6), 42);
    }
    glyphs.push(
      new opentype.Glyph({
        name: character,
        unicode: character.codePointAt(0),
        advanceWidth: Math.ceil(
          Math.max(...lines.flat().map(([x]) => x)) + radius + 53,
        ),
        path,
      }),
    );
  }
  const font = new opentype.Font({
    familyName: family,
    styleName: "Regular",
    unitsPerEm: 1000,
    ascender: 970,
    descender: -150,
    glyphs,
  });
  const directory = join(import.meta.dir, "../fonts");
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, family + ".otf"),
    new Uint8Array(font.toArrayBuffer()),
  );
}

buildFont(false);
buildFont(true);
