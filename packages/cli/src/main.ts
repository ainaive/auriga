#!/usr/bin/env bun
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseJobSpec } from "@auriga/core";
import { formatTrace, formatUsage } from "@auriga/capella";
import { loadEvalCases, runEvals } from "@auriga/evals";
import { buildDashboard, FileAuditLog, FileJobStore, Scheduler, Worker, type JobRecord } from "@auriga/habenae";
import { AnthropicProvider, MODELS } from "@auriga/provider";
import { selectDriver, type SandboxDriver } from "@auriga/sandbox";
import { openDevRegistry, searchSkills } from "@auriga/skill-registry";

const STORE_DIR = process.env.AURIGA_HOME ?? join(process.cwd(), ".auriga", "jobs");
const MODEL = process.env.AURIGA_MODEL ?? MODELS.sonnet;
const ACTOR = process.env.USER ?? "cli";

const auditLog = () => new FileAuditLog(STORE_DIR);

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const store = new FileJobStore(STORE_DIR);
  switch (cmd) {
    case "submit":
      await submit(store, rest);
      break;
    case "create":
      await create(store, rest);
      break;
    case "schedule":
      await schedule(store, rest);
      break;
    case "run":
      await run(store, rest);
      break;
    case "approve":
      await approve(store, rest);
      break;
    case "status":
      await status(store, rest);
      break;
    case "result":
      await result(store, rest);
      break;
    case "trace":
      await trace(store, rest);
      break;
    case "list":
      await list(store, rest);
      break;
    case "audit":
      await audit(rest);
      break;
    case "dashboard":
      await dashboard(store);
      break;
    case "skills":
      await skills(rest);
      break;
    case "eval":
      await evalCmd(rest);
      break;
    default:
      printUsage();
      if (cmd) process.exitCode = 1;
  }
}

function selectCliDriver(): Promise<SandboxDriver> {
  // The local CLI permits the non-isolated fallback; AURIGA_REQUIRE_DOCKER=1 enforces isolation.
  return selectDriver({ allowLocalFallback: process.env.AURIGA_REQUIRE_DOCKER !== "1" });
}

/** Run a job that already exists in the store, printing progress + result. */
async function runWorker(store: FileJobStore, id: string, model: string): Promise<void> {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is required to run a job.");
    process.exitCode = 1;
    return;
  }
  const driver = await selectCliDriver();
  console.log(`running ${id} · model ${model} · sandbox ${driver.name}`);
  const worker = new Worker({
    store,
    provider: new AnthropicProvider(),
    model,
    sandboxDriver: driver,
    audit: auditLog(),
    onEvent: (e) => {
      if (e.type === "verify") {
        console.log(`  attempt ${e.attempt}: verification ${e.passed ? "PASS" : "fail"}`);
      }
    },
  });
  const res = await worker.run(id);
  console.log(`\n${id}: ${res.state} — ${res.reason}`);
  console.log(`attempts=${res.attempts} steps=${res.steps} · ${formatUsage(model, res.usage)}`);
  if (res.state === "paused") {
    console.log(`paused for approval — run: auriga approve ${id} && auriga run ${id}`);
  }
  if (res.state === "failed") process.exitCode = 2;
}

async function submit(store: FileJobStore, args: string[]): Promise<void> {
  const specPath = args[0];
  if (!specPath) {
    console.error("usage: auriga submit <spec.json>");
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
  console.log(`submitted ${spec.id}`);
  await runWorker(store, spec.id, MODEL);
}

async function create(store: FileJobStore, args: string[]): Promise<void> {
  const specPath = args[0];
  if (!specPath) {
    console.error("usage: auriga create <spec.json>");
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
  await auditLog().record({ factio: spec.factio, actor: ACTOR, action: "job.created", job_id: spec.id });
  console.log(`created ${spec.id} (pending) — run \`auriga schedule\` to execute`);
}

async function schedule(store: FileJobStore, args: string[]): Promise<void> {
  const pending = (await store.list()).filter((j) => j.state === "pending");
  if (pending.length === 0) {
    console.log("(no pending jobs)");
    return;
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is required to run jobs.");
    process.exitCode = 1;
    return;
  }
  const driver = await selectCliDriver();
  const worker = new Worker({
    store,
    provider: new AnthropicProvider(),
    model: MODEL,
    sandboxDriver: driver,
  });
  const maxRetries = intArg(args, "--max-retries", 0);
  const scheduler = new Scheduler({
    store,
    run: (id) => worker.run(id),
    quotas: { global: intArg(args, "--global", 2), perFactio: intArg(args, "--per-factio", 1) },
    ...(maxRetries > 0 ? { retry: { maxRetries } } : {}),
  });
  const report = await scheduler.drain();
  console.log(
    `scheduled ${report.ran.length} runs · ${report.done.length} done · ` +
      `${report.failed.length} failed · ${report.blocked.length} blocked · ${report.retried.length} retries`,
  );
  if (report.failed.length > 0 || report.blocked.length > 0) process.exitCode = 2;
}

async function run(store: FileJobStore, args: string[]): Promise<void> {
  const rec = await requireJob(store, args[0]);
  if (!rec) return;
  await runWorker(store, rec.id, rec.model ?? MODEL);
}

async function approve(store: FileJobStore, args: string[]): Promise<void> {
  const rec = await requireJob(store, args[0]);
  if (!rec) return;
  await store.update(rec.id, { approved: true });
  await auditLog().record({ factio: rec.spec.factio, actor: ACTOR, action: "job.approved", job_id: rec.id });
  console.log(`approved ${rec.id} — run: auriga run ${rec.id}`);
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

async function trace(store: FileJobStore, args: string[]): Promise<void> {
  const rec = await requireJob(store, args[0]);
  if (!rec) return;
  const t = await store.loadTrace(rec.id);
  if (!t) {
    console.log(`no trace recorded for ${rec.id}`);
    return;
  }
  console.log(formatTrace(t));
}

async function list(store: FileJobStore, args: string[]): Promise<void> {
  const factio = flagValue(args, "--factio");
  if (args.includes("--factio") && !factio) {
    console.error("usage: auriga list --factio <factio>");
    process.exitCode = 1;
    return;
  }
  const jobs = factio ? await store.listByFactio(factio) : await store.list();
  if (!jobs.length) {
    console.log(factio ? `(no jobs in factio ${factio})` : "(no jobs)");
    return;
  }
  for (const j of jobs.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))) {
    console.log(`${j.id}  [${j.spec.factio}]  ${j.state}  ${formatUsage(j.model, j.usage)}`);
  }
}

function flagValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  if (i < 0) return undefined;
  const value = args[i + 1];
  // Don't consume the next flag as this flag's value.
  return value && !value.startsWith("--") ? value : undefined;
}

function intArg(args: string[], name: string, fallback: number): number {
  const raw = flagValue(args, name);
  const n = raw === undefined ? Number.NaN : Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

async function evalCmd(args: string[]): Promise<void> {
  const dir = args[0];
  if (!dir) {
    console.error("usage: auriga eval <suite-dir>");
    process.exitCode = 1;
    return;
  }
  const cases = await loadEvalCases(dir);
  if (!cases.length) {
    console.log(`no eval cases in ${dir}`);
    return;
  }
  const driver = await selectCliDriver();
  const { scores, summary } = await runEvals(cases, driver);
  for (const s of scores) {
    const mark = s.matches ? "✓" : "✗";
    console.log(`${mark} ${s.job_id}  replay=${s.replay_state} recorded=${s.recorded_state}${s.error ? ` (${s.error})` : ""}`);
  }
  const cost = Number.isFinite(summary.total_cost_usd) ? `~$${summary.total_cost_usd.toFixed(4)}` : "n/a";
  console.log(
    `\n${summary.matched}/${summary.total} matched · ${summary.done} done · ${summary.verify_passed} verified · cost ${cost}`,
  );
  if (summary.matched < summary.total) process.exitCode = 2;
}

async function audit(args: string[]): Promise<void> {
  const factio = flagValue(args, "--factio");
  if (args.includes("--factio") && !factio) {
    console.error("usage: auriga audit --factio <factio>");
    process.exitCode = 1;
    return;
  }
  const log = auditLog();
  const events = factio ? await log.listByFactio(factio, 50) : await log.list(50);
  if (!events.length) {
    console.log("(no audit events)");
    return;
  }
  for (const e of events) {
    console.log(`${e.ts}  [${e.factio}]  ${e.action}  ${e.job_id ?? ""}`);
  }
}

async function dashboard(store: FileJobStore): Promise<void> {
  const dash = await buildDashboard({ store, audit: auditLog() });
  console.log(
    `${dash.totals.jobs} jobs · ${dash.totals.tenants} tenants · ~$${dash.totals.cost_usd.toFixed(4)}`,
  );
  for (const t of dash.tenants) {
    const states = Object.entries(t.byState)
      .map(([k, v]) => `${k}:${v}`)
      .join(" ");
    console.log(`  [${t.factio}] ${t.total} jobs · ${states} · ~$${t.cost_usd.toFixed(4)}`);
  }
}

async function skills(args: string[]): Promise<void> {
  const skillsDir = process.env.AURIGA_SKILLS;
  if (!skillsDir) {
    console.error("set AURIGA_SKILLS to a skill registry directory");
    process.exitCode = 1;
    return;
  }
  const registry = await openDevRegistry(skillsDir);
  const query = flagValue(args, "-q") ?? flagValue(args, "--query");
  const entries = await searchSkills(
    { registry, stats: registry },
    { factio: "default", role: "viewer" },
    query ? { query } : {},
  );
  if (!entries.length) {
    console.log("(no skills)");
    return;
  }
  for (const e of entries) {
    console.log(`${e.name}@${e.version}  uses=${e.stats.uses} ok=${e.stats.successes}  ${e.description}`);
  }
}

async function requireJob(store: FileJobStore, id: string | undefined): Promise<JobRecord | undefined> {
  if (!id) {
    console.error("usage: auriga <run|approve|status|result|trace> <id>");
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
  auriga submit <spec.json>   create and run a job to completion
  auriga create <spec.json>   create a pending job (for DAGs / batch scheduling)
  auriga schedule [opts]      drain pending jobs (--global N --per-factio N --max-retries N)
  auriga run <id>             run/resume an existing job (e.g. after approval)
  auriga approve <id>         grant human approval to a paused job (HITL)
  auriga status <id>          show a job's state + cost
  auriga result <id>          show a job's final result
  auriga trace <id>           print the recorded trace + cost
  auriga list [--factio F]    list all jobs (optionally one tenant)
  auriga audit [--factio F]   show the governance audit trail
  auriga dashboard            per-tenant job/cost rollup
  auriga skills [-q query]    browse the skill marketplace (set AURIGA_SKILLS)
  auriga eval <suite-dir>     replay a suite of recorded traces and score them

env: ANTHROPIC_API_KEY (required for submit/run/schedule), AURIGA_MODEL, AURIGA_HOME,
     AURIGA_SKILLS (registry dir), AURIGA_REQUIRE_DOCKER=1 (require an isolated sandbox)`);
}

await main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exitCode = 1;
});
