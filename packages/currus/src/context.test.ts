import { test, expect } from "bun:test";
import { assistantText, toolResultBlock, toolResultMessage, userText } from "@auriga/core";
import { compactMessages, estimateTokens, messageTokens } from "./context";

test("estimateTokens grows with length", () => {
  expect(estimateTokens("")).toBe(0);
  expect(estimateTokens("abcd")).toBe(1);
  expect(estimateTokens("a".repeat(40))).toBe(10);
});

test("messageTokens sums across blocks", () => {
  const msgs = [userText("a".repeat(40)), assistantText("b".repeat(40))];
  expect(messageTokens(msgs)).toBe(20);
});

test("no-op when under budget (same array returned)", () => {
  const msgs = [userText("task"), assistantText("ok")];
  const r = compactMessages(msgs, { maxTokens: 10_000, keepRecent: 4 });
  expect(r.compacted).toBe(false);
  expect(r.messages).toBe(msgs);
});

test("compacts when over budget, keeping a valid transcript and recent context", () => {
  const big = "x".repeat(4000); // ~1000 tokens each
  const msgs = [
    userText("the task"),
    assistantText(big),
    toolResultMessage([toolResultBlock("t1", big)]),
    assistantText(big),
    toolResultMessage([toolResultBlock("t2", big)]),
    assistantText("recent assistant turn"),
    toolResultMessage([toolResultBlock("t3", "recent result here")]),
  ];
  const before = messageTokens(msgs);

  const r = compactMessages(msgs, { maxTokens: 500, keepRecent: 2 });

  expect(r.compacted).toBe(true);
  expect(r.after).toBeLessThan(before);
  expect(r.dropped.length).toBeGreaterThan(0);

  // valid transcript: user head, then assistant
  expect(r.messages[0]?.role).toBe("user");
  expect(r.messages[1]?.role).toBe("assistant");

  // task preserved + compaction marker present
  const head = JSON.stringify(r.messages[0]);
  expect(head).toContain("the task");
  expect(head).toContain("compacted");

  // recent context preserved verbatim
  expect(JSON.stringify(r.messages.at(-1))).toContain("recent result here");
});
