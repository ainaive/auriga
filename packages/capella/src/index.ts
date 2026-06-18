/**
 * @auriga/capella — observability / cost (the cockpit). Phase 1 ships cost
 * accounting; OTel tracing + the console follow in later phases.
 */
export { estimateCostUsd, formatUsage, PRICING, type ModelPricing } from "./cost";
export { Recorder } from "./recorder";
export { traceCost, type TraceCost } from "./rollup";
export { emitSpans } from "./tracing";
export { formatTrace } from "./format";
