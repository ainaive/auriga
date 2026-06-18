import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseJobSpec, type Trace } from "@auriga/core";
import type { EvalCase } from "./runner";

/**
 * Load eval cases from a directory of `<name>.json` files, each shaped
 * `{ "spec": <JobSpec>, "trace": <Trace> }`.
 */
export async function loadEvalCases(dir: string): Promise<EvalCase[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith(".json")).sort();
  const cases: EvalCase[] = [];
  for (const file of files) {
    const raw = JSON.parse(await readFile(join(dir, file), "utf8")) as {
      spec?: unknown;
      trace?: unknown;
    };
    const t = raw?.trace as Partial<Trace> | undefined;
    if (
      !t ||
      typeof t !== "object" ||
      typeof t.job_id !== "string" ||
      typeof t.model !== "string" ||
      !Array.isArray(t.events) ||
      !t.result
    ) {
      throw new Error(`invalid eval case ${file}: missing or malformed trace`);
    }
    cases.push({ spec: parseJobSpec(raw.spec), trace: t as Trace });
  }
  return cases;
}
