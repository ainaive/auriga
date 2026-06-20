import { describe, expect, it } from "vitest";
import { buildFileTree } from "@/lib/file-tree";

describe("buildFileTree", () => {
  it("nests by '/' and sorts directories before files, each alphabetical", () => {
    const tree = buildFileTree([
      { path: "src/b.ts", bytes: 2 },
      { path: "README.md", bytes: 5 },
      { path: "src/a.ts", bytes: 1 },
      { path: "src/util/x.ts", bytes: 3 },
    ]);
    expect(tree.map((n) => n.name)).toEqual(["src", "README.md"]); // dir first
    const src = tree[0];
    expect(src?.children?.map((n) => n.name)).toEqual(["util", "a.ts", "b.ts"]); // dir, then files alpha
    const leaf = src?.children?.find((n) => n.name === "a.ts");
    expect(leaf).toMatchObject({ path: "src/a.ts", bytes: 1 });
    expect(leaf?.children).toBeUndefined();
  });

  it("handles empty input and a single top-level file", () => {
    expect(buildFileTree([])).toEqual([]);
    expect(buildFileTree([{ path: "a.txt", bytes: 1 }])).toEqual([
      { name: "a.txt", path: "a.txt", bytes: 1 },
    ]);
  });
});
