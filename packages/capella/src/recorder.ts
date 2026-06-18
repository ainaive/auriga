import type { Trace, TraceEvent, TraceResult } from "@auriga/core";

/**
 * Collects the trace events emitted during a run into a Trace. Pass `record` as
 * the `onTrace` hook to runJob, then call `finish(result)` to seal the trace.
 */
export class Recorder {
  private readonly events: TraceEvent[] = [];

  constructor(
    private readonly jobId: string,
    private readonly model: string,
  ) {}

  /** Bound so it can be passed directly as `onTrace`. */
  readonly record = (event: TraceEvent): void => {
    this.events.push(event);
  };

  finish(result: TraceResult): Trace {
    return { job_id: this.jobId, model: this.model, events: [...this.events], result };
  }
}
