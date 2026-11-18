import { Schema } from "effect";
import { nearestInDirection } from "@ui-sdk/core";

export const pageLayout = Schema.decodeUnknownSync(
  Schema.Literals(["picture-first", "grid-first", "side-by-side"]),
);

export type Cell = [number, number];
const arrows: Record<string, Cell> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
};
function bounds([x, y]: Cell) {
  return { left: x, right: x + 1, top: y, bottom: y + 1 };
}

export function nextCell(current: Cell, cells: Iterable<Cell>, key: string) {
  const direction = arrows[key];
  if (!direction) return;
  // Crossword rows and columns have meaning. A diagonal jump loses the clue.
  const axis = direction[0] ? 1 : 0;
  const candidates = Array.from(cells).filter(
    (cell) => cell[axis] === current[axis] && String(cell) !== String(current),
  );
  return nearestInDirection(
    bounds(current),
    candidates.map((cell) => ({ key: String(cell), rect: bounds(cell) })),
    direction,
  );
}
