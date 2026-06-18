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
    const raw = JSON.parse(await readFile(join(dir, file), "utf8")) as { spec: unknown; trace: Trace };
    cases.push({ spec: parseJobSpec(raw.spec), trace: raw.trace });
  }
  return cases;
}
