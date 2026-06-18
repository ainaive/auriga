import {
  recordedResponses,
  type GenerateRequest,
  type ModelProvider,
  type ModelResponse,
  type Trace,
} from "@auriga/core";

/**
 * A ModelProvider that replays a trace's recorded model responses in order — no
 * network, fully deterministic. If the harness asks for more responses than were
 * recorded, the run has diverged from the trace, and complete() throws so the
 * eval runner can flag it.
 */
export class ReplayProvider implements ModelProvider {
  readonly name = "replay";
  private readonly queue: ModelResponse[];

  constructor(trace: Trace) {
    this.queue = recordedResponses(trace);
  }

  async complete(_req: GenerateRequest): Promise<ModelResponse> {
    const next = this.queue.shift();
    if (!next) {
      throw new Error("replay exhausted: the harness diverged from the recorded trace");
    }
    return next;
  }
}
