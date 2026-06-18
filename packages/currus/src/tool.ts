/**
 * A tool the harness can dispatch. `run` executes the call and returns a string
 * result fed back to the model. The control-plane allowlist gate (Phase 1) decides
 * *whether* a tool may run; this interface is just *how* it runs.
 */
export interface Tool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  run(input: Record<string, unknown>): Promise<string>;
}
