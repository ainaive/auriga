import type { Tool } from "../tool";

/** Trivial demonstration tool: echoes back the provided text. */
export const echoTool: Tool = {
  name: "echo",
  description: "Echo back the provided text.",
  input_schema: {
    type: "object",
    properties: { text: { type: "string", description: "Text to echo back." } },
    required: ["text"],
  },
  async run(input) {
    return String(input.text ?? "");
  },
};
