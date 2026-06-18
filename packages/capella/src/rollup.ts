import type { Trace, Usage } from "@auriga/core";
import { estimateCostUsd } from "./cost";

export interface TraceCost {
  model: string;
  usage: Usage;
  /** USD; NaN if the model has no pricing entry. */
  cost_usd: number;
  model_calls: number;
}

/** Roll up token usage + cost from a trace's model_response events. */
export function traceCost(trace: Trace): TraceCost {
  let input = 0;
  let output = 0;
  let calls = 0;
  for (const e of trace.events) {
    if (e.type === "model_response") {
      input += e.response.usage.input_tokens;
      output += e.response.usage.output_tokens;
      calls++;
    }
  }
  const usage: Usage = { input_tokens: input, output_tokens: output };
  return { model: trace.model, usage, cost_usd: estimateCostUsd(trace.model, usage), model_calls: calls };
}
