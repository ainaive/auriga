import { context, SpanStatusCode, trace, type Tracer } from "@opentelemetry/api";
import type { Trace } from "@auriga/core";

const TRACER_NAME = "auriga";

/**
 * Emit an OpenTelemetry span tree for a recorded job trace: a root span per job
 * with a child span per step (model call / tool call / verify / skill load),
 * using GenAI-flavored attributes. With no SDK registered the spans are no-ops;
 * register an exporter (Jaeger/Tempo/OTLP) to ship them.
 */
export function emitSpans(t: Trace, tracer: Tracer = trace.getTracer(TRACER_NAME)): void {
  const root = tracer.startSpan(`job ${t.job_id}`, {
    attributes: {
      "auriga.job_id": t.job_id,
      "gen_ai.request.model": t.model,
      "auriga.state": t.result.state,
      "auriga.attempts": t.result.attempts,
      "auriga.steps": t.result.steps,
      "gen_ai.usage.input_tokens": t.result.usage.input_tokens,
      "gen_ai.usage.output_tokens": t.result.usage.output_tokens,
    },
  });
  const ctx = trace.setSpan(context.active(), root);

  try {
    for (const e of t.events) {
      switch (e.type) {
        case "model_response": {
          const s = tracer.startSpan("gen_ai.model_response", {
            attributes: {
              "gen_ai.usage.input_tokens": e.response.usage.input_tokens,
              "gen_ai.usage.output_tokens": e.response.usage.output_tokens,
              "gen_ai.response.finish_reason": e.response.stop_reason,
            },
          }, ctx);
          s.end();
          break;
        }
        case "tool_call": {
          const s = tracer.startSpan(`tool ${e.tool}`, {
            attributes: { "auriga.tool": e.tool, "auriga.tool.is_error": e.isError },
          }, ctx);
          if (e.isError) s.setStatus({ code: SpanStatusCode.ERROR });
          s.end();
          break;
        }
        case "skill_loaded": {
          const s = tracer.startSpan(`skill ${e.skill.name}`, {
            attributes: { "auriga.skill.name": e.skill.name, "auriga.skill.version": e.skill.version },
          }, ctx);
          s.end();
          break;
        }
        case "verify": {
          const s = tracer.startSpan(`verify attempt ${e.attempt}`, {
            attributes: { "auriga.verify.attempt": e.attempt, "auriga.verify.passed": e.passed },
          }, ctx);
          if (!e.passed) s.setStatus({ code: SpanStatusCode.ERROR });
          s.end();
          break;
        }
        case "compaction": {
          const s = tracer.startSpan("context.compaction", {
            attributes: {
              "auriga.compaction.dropped": e.dropped,
              "auriga.compaction.before_tokens": e.before,
              "auriga.compaction.after_tokens": e.after,
            },
          }, ctx);
          s.end();
          break;
        }
      }
    }
    if (t.result.state === "failed") {
      root.setStatus({ code: SpanStatusCode.ERROR, message: t.result.reason });
    }
  } finally {
    root.end();
  }
}
