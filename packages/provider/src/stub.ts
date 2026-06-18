import type { GenerateRequest, ModelProvider, ModelResponse } from "@auriga/core";

/**
 * A deterministic provider for tests and the hello-world loop. It replays a queue
 * of scripted responses and records every request it received, so loop behavior
 * can be asserted without a live model. Satisfies the same ModelProvider contract.
 */
export class StubProvider implements ModelProvider {
  readonly name = "stub";
  private readonly queue: ModelResponse[];
  /** Every request passed to complete(), in order — useful for assertions. */
  readonly calls: GenerateRequest[] = [];

  constructor(responses: ModelResponse[] = []) {
    this.queue = [...responses];
  }

  /** Append more scripted responses. */
  enqueue(...responses: ModelResponse[]): void {
    this.queue.push(...responses);
  }

  async complete(req: GenerateRequest): Promise<ModelResponse> {
    this.calls.push(req);
    const next = this.queue.shift();
    if (!next) {
      throw new Error("StubProvider: no scripted response left for complete()");
    }
    return next;
  }
}
