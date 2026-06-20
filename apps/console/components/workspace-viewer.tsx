"use client";

import { File, Folder } from "lucide-react";
import { useRef, useState } from "react";
import { buildFileTree, type FileNode } from "@/lib/file-tree";
import type { WorkspaceEntry, WorkspaceFile } from "@/lib/api";
import { cn } from "@/lib/utils";

/** The latest checkpoint workspace: a file tree + a lazy-loaded file viewer. */
export function WorkspaceViewer({ jobId, files }: { jobId: string; files: WorkspaceEntry[] }) {
  const tree = buildFileTree(files);
  const [selected, setSelected] = useState<string | null>(null);
  const [file, setFile] = useState<WorkspaceFile | null>(null);
  const [loading, setLoading] = useState(false);
  const latest = useRef<string | null>(null);

  async function open(path: string) {
    latest.current = path;
    setSelected(path);
    setFile(null);
    setLoading(true);
    try {
      const res = await fetch(
        `/api/jobs/${encodeURIComponent(jobId)}/workspace/file?path=${encodeURIComponent(path)}`,
        { cache: "no-store" },
      );
      const data = res.ok ? ((await res.json()) as WorkspaceFile) : null;
      if (latest.current === path) setFile(data); // ignore a response for a since-superseded click
    } catch {
      if (latest.current === path) setFile(null);
    } finally {
      if (latest.current === path) setLoading(false);
    }
  }

  return (
    <div className="grid gap-3 sm:grid-cols-[16rem_1fr]">
      <div
        aria-label="workspace files"
        className="max-h-96 overflow-auto rounded-md border bg-muted/30 p-1 text-sm"
      >
        <Tree nodes={tree} selected={selected} onOpen={open} depth={0} />
      </div>
      <div className="min-w-0">
        {!selected ? (
          <p className="text-sm text-muted-foreground">Select a file to view its contents.</p>
        ) : (
          <>
            <div className="mb-1 flex items-baseline gap-2">
              <span className="font-mono text-xs">{selected}</span>
              {file && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {file.bytes} bytes{file.truncated ? " · truncated" : ""}
                </span>
              )}
            </div>
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : !file ? (
              <p className="text-sm text-destructive">Could not load file.</p>
            ) : file.encoding === "base64" ? (
              <p className="text-sm text-muted-foreground">Binary file · {file.bytes} bytes</p>
            ) : (
              <pre className="max-h-96 overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/60 p-2 font-mono text-xs">
                {file.content}
              </pre>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Tree({
  nodes,
  selected,
  onOpen,
  depth,
}: {
  nodes: FileNode[];
  selected: string | null;
  onOpen: (path: string) => void;
  depth: number;
}) {
  return (
    <ul className={depth === 0 ? "" : "ml-3"}>
      {nodes.map((node) =>
        node.children ? (
          <li key={node.path}>
            <div className="flex items-center gap-1.5 px-1 py-0.5 text-muted-foreground">
              <Folder className="size-3.5 shrink-0" />
              {node.name}
            </div>
            <Tree nodes={node.children} selected={selected} onOpen={onOpen} depth={depth + 1} />
          </li>
        ) : (
          <li key={node.path}>
            <button
              type="button"
              aria-current={selected === node.path ? "true" : undefined}
              onClick={() => onOpen(node.path)}
              className={cn(
                "flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left hover:bg-accent",
                selected === node.path && "bg-accent font-medium",
              )}
            >
              <File className="size-3.5 shrink-0" />
              <span className="truncate">{node.name}</span>
            </button>
          </li>
        ),
      )}
    </ul>
  );
}
