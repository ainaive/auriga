/**
 * Emit the JSON Schema for JobSpec to schema/job.schema.json so external tools
 * (CLI, API, cross-language validators) can consume the job contract.
 *
 * Run from packages/core:  bun run emit-schema
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { JobSpecSchema } from "../src/job/spec";

const jsonSchema = z.toJSONSchema(JobSpecSchema, { target: "draft-2020-12" });

const here = dirname(fileURLToPath(import.meta.url));
const outPath = join(here, "..", "schema", "job.schema.json");

await Bun.write(outPath, `${JSON.stringify(jsonSchema, null, 2)}\n`);
console.log(`wrote ${outPath}`);
