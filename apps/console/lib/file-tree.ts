// Build a nested file tree from flat workspace paths (pure; unit-tested in Vitest).

export interface FileEntry {
  path: string;
  bytes: number;
}

export interface FileNode {
  name: string;
  path: string;
  /** Present for files (leaves). */
  bytes?: number;
  /** Present for directories. */
  children?: FileNode[];
}

/** Flat `{path, bytes}[]` → nested tree, directories sorted before files, each alphabetical. */
export function buildFileTree(entries: FileEntry[]): FileNode[] {
  const root: FileNode = { name: "", path: "", children: [] };

  for (const entry of entries) {
    const parts = entry.path.split("/").filter(Boolean);
    let node = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLeaf = i === parts.length - 1;
      node.children ??= [];
      let child = node.children.find((c) => c.name === part);
      if (!child) {
        const path = parts.slice(0, i + 1).join("/");
        child = isLeaf ? { name: part, path, bytes: entry.bytes } : { name: part, path, children: [] };
        node.children.push(child);
      }
      node = child;
    }
  }

  sortTree(root);
  return root.children ?? [];
}

function sortTree(node: FileNode): void {
  if (!node.children) return;
  node.children.sort((a, b) => {
    const aDir = a.children ? 0 : 1;
    const bDir = b.children ? 0 : 1;
    return aDir - bDir || a.name.localeCompare(b.name);
  });
  for (const child of node.children) sortTree(child);
}
