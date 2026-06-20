import { describe, expect, it } from "vitest";
import { pagerBounds } from "@/lib/pager";

describe("pagerBounds", () => {
  it("first page of two", () => {
    expect(pagerBounds(50, 25, 0)).toMatchObject({
      from: 1,
      to: 25,
      hasPrev: false,
      hasNext: true,
      page: 1,
      pages: 2,
    });
  });

  it("last (full) page", () => {
    expect(pagerBounds(50, 25, 25)).toMatchObject({ from: 26, to: 50, hasPrev: true, hasNext: false, page: 2 });
  });

  it("partial last page", () => {
    expect(pagerBounds(30, 25, 25)).toMatchObject({ from: 26, to: 30, hasNext: false });
  });

  it("empty result", () => {
    expect(pagerBounds(0, 25, 0)).toMatchObject({ from: 0, to: 0, hasPrev: false, hasNext: false, pages: 1 });
  });
});
