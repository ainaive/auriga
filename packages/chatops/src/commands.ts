/** A parsed ChatOps command (platform-agnostic). */
export type Command =
  | { kind: "help" }
  | { kind: "list"; factio?: string }
  | { kind: "status"; id: string }
  | { kind: "approve"; id: string }
  | { kind: "dashboard" }
  | { kind: "submit"; spec: unknown }
  | { kind: "error"; message: string };

export const HELP = [
  "Auriga commands:",
  "• list [factio] — your jobs",
  "• status <id> — a job's state",
  "• approve <id> — approve a paused job",
  "• dashboard — tenant rollup",
  "• submit <job-json> — submit a job",
].join("\n");

/** Parse a slash-command text body into a Command (never throws). */
export function parseCommand(input: string): Command {
  const text = input.trim();
  if (!text || text === "help") return { kind: "help" };

  const parts = text.split(/\s+/);
  const verb = parts[0];
  const rest = parts.slice(1);
  const arg = text.slice(verb!.length).trim();

  switch (verb) {
    case "list":
      return rest[0] ? { kind: "list", factio: rest[0] } : { kind: "list" };
    case "status":
      return rest[0]
        ? { kind: "status", id: rest[0] }
        : { kind: "error", message: "usage: status <id>" };
    case "approve":
      return rest[0]
        ? { kind: "approve", id: rest[0] }
        : { kind: "error", message: "usage: approve <id>" };
    case "dashboard":
      return { kind: "dashboard" };
    case "submit": {
      if (!arg) return { kind: "error", message: "usage: submit <job-json>" };
      try {
        return { kind: "submit", spec: JSON.parse(arg) };
      } catch {
        return { kind: "error", message: "submit: invalid JSON spec" };
      }
    }
    default:
      return { kind: "error", message: `unknown command: ${verb}` };
  }
}
