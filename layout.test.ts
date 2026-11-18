import { expect, test } from "bun:test";
import { nextCell, pageLayout, type Cell } from "./layout";
const cells: Cell[] = [
  [2, 4],
  [5, 4],
  [3, 3],
  [2, 1],
];
test("arrow navigation skips holes, keeps the axis and stops at the border", () => {
  expect(nextCell([2, 4], cells, "ArrowRight")).toBe("5,4");
  expect(nextCell([5, 4], cells, "ArrowLeft")).toBe("2,4");
  expect(nextCell([2, 4], cells, "ArrowUp")).toBe("2,1");
  expect(nextCell([2, 4], cells, "ArrowDown")).toBeUndefined();
  expect(nextCell([2, 4], cells, "A")).toBeUndefined();
});
test("edition layout accepts only supported arrangements", () => {
  expect(pageLayout("side-by-side")).toBe("side-by-side");
  expect(() => pageLayout("script")).toThrow();
});
