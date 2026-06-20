import { describe, expect, it } from "vitest";
import { sparklinePoints } from "@/lib/sparkline";

describe("sparklinePoints", () => {
  it("maps values to points within bounds (0 → bottom, max → top)", () => {
    const pts = sparklinePoints([0, 5, 10], 100, 20).split(" ");
    expect(pts).toHaveLength(3);
    expect(pts[0]).toBe("0.0,20.0"); // first x, min → bottom
    expect(pts[2]).toBe("100.0,0.0"); // last x, max → top
  });

  it("handles empty + all-zero series", () => {
    expect(sparklinePoints([], 100, 20)).toBe("");
    expect(sparklinePoints([0, 0], 100, 20)).toBe("0.0,20.0 100.0,20.0"); // flat at bottom
  });
});
