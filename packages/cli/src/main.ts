#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseJobSpec } from "@auriga/core";
import { formatUsage } from "@auriga/capella";
import { FileJobStore, Worker, type JobRecord } from "@auriga/habenae";
import { AnthropicProvider, MODELS } from "@auriga/provider";
import { selectDriver } from "@auriga/sandbox";

const STORE_DIR = process.env.AURIGA_HOME ?? join(process.cwd(), ".auriga", "jobs");
const MODEL = process.env.AURIGA_MODEL ?? MODELS.sonnet;

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const store = new FileJobStore(STORE_DIR);
  switch (cmd) {
    case "submit":
      await submit(store, rest);
      break;
    case "status":
      await status(store, rest);
      break;
    case "result":
      await result(store, rest);
      break;
    case "list":
      await list(store);
      break;
    default:
      printUsage();
      if (cmd) process.exitCode = 1;
  }
}

async function submit(store: FileJobStore, args: string[]): Promise<void> {
  const specPath = args[0];
  if (!specPath) {
    console.error("usage: auriga submit <spec.json>");
    process.exitCode = 1;
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is required to run a job.");
    process.exitCode = 1;
    return;
  }

  let spec: ReturnType<typeof parseJobSpec>;
  try {
    spec = parseJobSpec(JSON.parse(await readFile(specPath, "utf8")));
  } catch (err) {
    console.error(`failed to read/parse spec: ${specPath}`);
    console.error(err instanceof Error ? err.message : String(err));
    process.exitCode = 1;
    return;
  }
  await store.create(spec);
  // The local CLI explicitly permits the non-isolated fallback (set
  // AURIGA_REQUIRE_DOCKER=1 to require real isolation).
  const driver = await selectDriver({
    allowLocalFallback: process.env.AURIGA_REQUIRE_DOCKER !== "1",
  });
  console.log(`submitted ${spec.id} · model ${MODEL} · sandbox ${driver.name}`);

  const worker = new Worker({
    store,
    provider: new AnthropicProvider(),
    model: MODEL,
    sandboxDriver: driver,
    onEvent: (e) => {
      if (e.type === "verify") {
        console.log(`  attempt ${e.attempt}: verification ${e.passed ? "PASS" : "fail"}`);
      }
    },
  });

  const res = await worker.run(spec.id);
  console.log(`\n${spec.id}: ${res.state} — ${res.reason}`);
  console.log(`attempts=${res.attempts} steps=${res.steps} · ${formatUsage(MODEL, res.usage)}`);
  if (res.state !== "done") process.exitCode = 2;
}

async function status(store: FileJobStore, args: string[]): Promise<void> {
  const rec = await requireJob(store, args[0]);
  if (!rec) return;
  console.log(`${rec.id}  ${rec.state}  attempts=${rec.attempts} steps=${rec.steps}`);
  console.log(`  ${formatUsage(rec.model, rec.usage)}`);
  if (rec.reason) console.log(`  reason: ${rec.reason}`);
}

async function result(store: FileJobStore, args: string[]): Promise<void> {
  const rec = await requireJob(store, args[0]);
  if (!rec) return;
  console.log(`job:      ${rec.id}`);
  console.log(`state:    ${rec.state}`);
  console.log(`reason:   ${rec.reason ?? "(none)"}`);
  console.log(`attempts: ${rec.attempts}   steps: ${rec.steps}`);
  console.log(`cost:     ${formatUsage(rec.model, rec.usage)}`);
  if (rec.loaded_skills.length) {
    console.log(`skills:   ${rec.loaded_skills.map((s) => `${s.name}@${s.version}`).join(", ")}`);
  }
}

async function list(store: FileJobStore): Promise<void> {
  const jobs = await store.list();
  if (!jobs.length) {
    console.log("(no jobs)");
    return;
  }
  for (const j of jobs.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))) {
    console.log(`${j.id}  ${j.state}  ${formatUsage(j.model, j.usage)}`);
  }
}

async function requireJob(store: FileJobStore, id: string | undefined): Promise<JobRecord | undefined> {
  if (!id) {
    console.error("usage: auriga <status|result> <id>");
    process.exitCode = 1;
    return undefined;
  }
  const rec = await store.get(id);
  if (!rec) {
    console.error(`job not found: ${id}`);
    process.exitCode = 1;
    return undefined;
  }
  return rec;
}

function printUsage(): void {
  console.log(`auriga — harness job platform

usage:
  auriga submit <spec.json>   submit and run a job to completion
  auriga status <id>          show a job's state + cost
  auriga result <id>          show a job's final result
  auriga list                 list all jobs

env: ANTHROPIC_API_KEY (required for submit), AURIGA_MODEL, AURIGA_HOME`);
}

await main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
