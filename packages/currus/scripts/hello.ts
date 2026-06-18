/**
 * Hello-world harness loop (plan task 0.6): a single model→tool→model round trip
 * through the provider abstraction. Uses the deterministic StubProvider by
 * default; set ANTHROPIC_API_KEY to run it against the real model.
 *
 *   bun run hello           # stub (no network)
 *   ANTHROPIC_API_KEY=... bun run hello   # live
 */
import { textResponse, toolUseResponse, userText } from "@auriga/core";
import { AnthropicProvider, MODELS, StubProvider } from "@auriga/provider";
import { runLoop } from "../src/loop";
import { echoTool } from "../src/tools/echo";

const live = Boolean(process.env.ANTHROPIC_API_KEY);

const provider = live
  ? new AnthropicProvider()
  : new StubProvider([
      toolUseResponse("echo", { text: "Hello from Auriga" }),
      textResponse("The echo tool returned: Hello from Auriga"),
    ]);

const result = await runLoop({
  provider,
  model: live ? MODELS.haiku : "stub",
  system:
    "You are a tiny demo agent. If asked to echo text, call the echo tool, then report what it returned.",
  messages: [
    userText("Use the echo tool to echo 'Hello from Auriga', then tell me what it returned."),
  ],
  tools: [echoTool],
  maxSteps: 5,
});

console.log(`[${live ? "anthropic" : "stub"}] steps=${result.steps} stop=${result.stop}`);
console.log(`tokens: in=${result.usage.input_tokens} out=${result.usage.output_tokens}`);
console.log(`final: ${result.text}`);
