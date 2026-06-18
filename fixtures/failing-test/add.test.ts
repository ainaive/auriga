import { test, expect } from "bun:test";
import { add } from "./src/add";

test("add sums two numbers", () => {
  expect(add(2, 3)).toBe(5);
  expect(add(-1, 1)).toBe(0);
});
