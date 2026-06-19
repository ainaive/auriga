import { expect, test } from "bun:test";
import { parseCommand } from "./commands";

test("parses the command verbs", () => {
  expect(parseCommand("")).toEqual({ kind: "help" });
  expect(parseCommand("help")).toEqual({ kind: "help" });
  expect(parseCommand("list")).toEqual({ kind: "list" });
  expect(parseCommand("list acme")).toEqual({ kind: "list", factio: "acme" });
  expect(parseCommand("status job_1")).toEqual({ kind: "status", id: "job_1" });
  expect(parseCommand("approve job_1")).toEqual({ kind: "approve", id: "job_1" });
  expect(parseCommand("dashboard")).toEqual({ kind: "dashboard" });
});

test("submit parses a JSON spec; invalid json is an error", () => {
  expect(parseCommand('submit {"id":"j"}')).toEqual({ kind: "submit", spec: { id: "j" } });
  expect(parseCommand("submit not-json").kind).toBe("error");
  expect(parseCommand("submit").kind).toBe("error");
});

test("missing args and unknown verbs are errors", () => {
  expect(parseCommand("status").kind).toBe("error");
  expect(parseCommand("approve").kind).toBe("error");
  expect(parseCommand("frobnicate").kind).toBe("error");
});
