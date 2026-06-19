#!/usr/bin/env bun
import { join } from "node:path";
import { FileAuditLog, FileConfigStore, FileJobStore, StoreBackedPolicy } from "@auriga/habenae";
import { createApp } from "./app";
import { createRunner } from "./runner";

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
const app = createApp({
  store,
  audit,
  config,
  // RBAC reads from the (web-editable) config store, so edits take effect without a restart.
  policy: new StoreBackedPolicy(config),
  // In-process background runner (undefined without ANTHROPIC_API_KEY → /run answers 503).
  runJob: createRunner(store, audit)?.run,
});

console.log(`auriga api listening on http://localhost:${port}`);
export default { port, fetch: app.fetch };
