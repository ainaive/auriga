#!/usr/bin/env bun
import { join } from "node:path";
import { FileAuditLog, FileJobStore, InMemoryPolicy } from "@auriga/habenae";
import { createApp } from "./app";

/**
 * Dev server entry. Wires the file-backed control plane and a permissive default
 * policy for `default`. Production deployments supply a real Policy (and the
 * Postgres store / a real registry).
 */
const home = process.env.AURIGA_HOME ?? join(process.cwd(), ".auriga", "jobs");
const port = Number.parseInt(process.env.PORT ?? "8787", 10);

const app = createApp({
  store: new FileJobStore(home),
  audit: new FileAuditLog(home),
  policy: new InMemoryPolicy([{ factio: "default", roles: ["dev", "admin", "viewer"] }]),
});

console.log(`auriga api listening on http://localhost:${port}`);
export default { port, fetch: app.fetch };
