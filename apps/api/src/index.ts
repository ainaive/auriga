#!/usr/bin/env bun
import { join } from "node:path";
import {
  FileAuditLog,
  FileConfigStore,
  FileJobStore,
  InMemoryEventBus,
  StoreBackedPolicy,
} from "@auriga/habenae";
import { createApp } from "./app";
import { createRunner } from "./runner";
import { createStubRunner } from "./stub-runner";

/**
 * Dev server entry. Wires the file-backed control plane. The RBAC policy is read
 * from a persisted, web-editable config store (seeded with a permissive `default`
 * factio). Production deployments supply the Postgres store / a real registry.
 */
const home = process.env.AURIGA_HOME ?? join(process.cwd(), ".auriga", "jobs");

function parsePort(raw: string | undefined): number {
  const n = raw === undefined ? 8787 : Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`invalid PORT: ${raw} (expected 1..65535)`);
  }
  return n;
}
const port = parsePort(process.env.PORT);

const store = new FileJobStore(home);
const audit = new FileAuditLog(home);
const config = await FileConfigStore.open(home);
// In-process live event bus: the runner (publisher) and the SSE endpoint (subscriber)
// share one instance, so a browser can watch a run stream step by step. The production
// cross-process path uses the Postgres LISTEN/NOTIFY bus instead.
const bus = new InMemoryEventBus();
// AURIGA_STUB_RUNNER=1 → a deterministic, network-free runner (E2E/offline dev);
// otherwise the live in-process runner (undefined without ANTHROPIC_API_KEY → /run 503).
const runner =
  process.env.AURIGA_STUB_RUNNER === "1"
    ? createStubRunner(store, audit, bus)
    : createRunner(store, audit, config, bus);
const app = createApp({
  store,
  audit,
  config,
  bus,
  // RBAC reads from the (web-editable) config store, so edits take effect without a restart.
  policy: new StoreBackedPolicy(config),
  runJob: runner?.run,
});

console.log(`auriga api listening on http://localhost:${port}`);
export default { port, fetch: app.fetch };
