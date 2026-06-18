import type { Message } from "@auriga/core";

/**
 * Context engineering: token budgeting + compaction. Context is a resource that
 * rots, so we compact actively rather than just stuffing the window. The full
 * dropped history is offloaded to the sandbox scratchpad by the loop (see memory.ts).
 */

/** Rough token estimate (~4 chars/token). Good enough for budgeting decisions. */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function messageTokens(messages: readonly Message[]): number {
  let total = 0;
  for (const m of messages) {
    for (const b of m.content) {
      if (b.type === "text") total += estimateTokens(b.text);
      else if (b.type === "tool_use") total += estimateTokens(b.name) + estimateTokens(JSON.stringify(b.input));
      else total += estimateTokens(b.content);
    }
  }
  return total;
}

export interface CompactionOptions {
  /** Compact once the estimated window exceeds this. */
  maxTokens: number;
  /** Always keep at least this many trailing messages verbatim. */
  keepRecent: number;
}

export interface CompactionResult {
  messages: Message[];
  compacted: boolean;
  /** Messages removed from the live window (the loop offloads these to disk). */
  dropped: Message[];
  before: number;
  after: number;
}

/**
 * Compact a transcript that exceeds the budget: keep the first message (the task)
 * with an appended summary of the dropped middle, plus the last `keepRecent`
 * messages verbatim. The tail is advanced to an assistant boundary so the result
 * stays a valid (alternating, no orphaned tool_result) transcript.
 *
 * Invariant: messages[0] is the user task message.
 */
export function compactMessages(messages: Message[], opts: CompactionOptions): CompactionResult {
  const before = messageTokens(messages);
  const first = messages[0];
  if (before <= opts.maxTokens || !first || messages.length <= opts.keepRecent + 1) {
    return { messages, compacted: false, dropped: [], before, after: before };
  }

  let start = Math.max(1, messages.length - opts.keepRecent);
  while (start < messages.length && messages[start]?.role !== "assistant") start++;

  const dropped = messages.slice(1, start);
  if (dropped.length === 0) {
    return { messages, compacted: false, dropped: [], before, after: before };
  }

  const tail = messages.slice(start);
  const head: Message = {
    role: first.role,
    content: [
      ...first.content,
      {
        type: "text",
        text: `\n\n[Context compacted — ${dropped.length} earlier messages summarized:\n${summarize(dropped)}\n]`,
      },
    ],
  };
  const compacted = [head, ...tail];
  return { messages: compacted, compacted: true, dropped, before, after: messageTokens(compacted) };
}

function summarize(dropped: readonly Message[]): string {
  const lines: string[] = [];
  for (const m of dropped) {
    for (const b of m.content) {
      if (b.type === "text") {
        const t = firstLine(b.text);
        if (t) lines.push(`${m.role}: ${t}`);
      } else if (b.type === "tool_use") {
        lines.push(`called ${b.name}(${inline(JSON.stringify(b.input), 120)})`);
      } else {
        lines.push(`→ ${firstLine(b.content)}`);
      }
    }
  }
  return lines.slice(-50).join("\n");
}

function firstLine(s: string): string {
  return inline(s.split("\n").find((l) => l.trim().length > 0) ?? "", 200);
}

function inline(s: string, max: number): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}
