import { describe, expect, it } from "vitest";
import { buildJobSpec, csv, defaultJobForm, type JobFormState } from "@/lib/job-form";

const IDENT = { factio: "acme", created_by: "dev@acme" };
const base = (): JobFormState => ({ ...defaultJobForm(), id: "job_1", goal: "do the thing" });

describe("csv", () => {
  it("splits, trims, and drops empties (comma or newline)", () => {
    expect(csv(" a, b ,,\nc ")).toEqual(["a", "b", "c"]);
    expect(csv("")).toEqual([]);
  });
});

describe("buildJobSpec", () => {
  it("assembles a valid spec from defaults", () => {
    const { spec, errors } = buildJobSpec(base(), IDENT);
    expect(errors).toEqual({});
    expect(spec).toMatchObject({
      id: "job_1",
      factio: "acme",
      created_by: "dev@acme",
      goal: "do the thing",
      context_refs: { workspace: { kind: "dir", url_or_path: "./fixtures/failing-test" } },
      allowed_tools: ["read_file", "write_file", "bash", "git", "search"],
      acceptance_criteria: [{ kind: "command", cmd: "bun test", expect_exit: 0 }],
      budget: { max_tokens: 200000, max_wall_time_s: 600, max_cost_usd: 5, max_steps: 30 },
    });
  });

  it("reports field errors for missing goal / bad budget and yields no spec", () => {
    const { spec, errors } = buildJobSpec({ ...base(), goal: "", maxTokens: "0" }, IDENT);
    expect(spec).toBeUndefined();
    expect(errors.goal).toBeTruthy();
    expect(errors.maxTokens).toBeTruthy();
  });

  it("validates each criterion by kind", () => {
    const { errors } = buildJobSpec(
      { ...base(), criteria: [{ kind: "file_exists", path: "" }] },
      IDENT,
    );
    expect(errors["criteria.0"]).toBeTruthy();
  });

  it("omits optional fields when empty and includes them when set", () => {
    const lean = buildJobSpec(base(), IDENT).spec ?? {};
    expect(lean).not.toHaveProperty("require_approval");
    expect(lean).not.toHaveProperty("required_skills");
    expect(lean.context_refs).not.toHaveProperty("files");

    const rich = buildJobSpec(
      { ...base(), requireApproval: true, requiredSkills: "tdd, lint", files: "a.ts", dependsOn: "job_0" },
      IDENT,
    ).spec ?? {};
    expect(rich.require_approval).toBe(true);
    expect(rich.required_skills).toEqual(["tdd", "lint"]);
    expect((rich.context_refs as { files: string[] }).files).toEqual(["a.ts"]);
    expect(rich.depends_on).toEqual(["job_0"]);
  });

  it("includes an optional workspace ref only when provided", () => {
    const { spec } = buildJobSpec({ ...base(), workspaceRef: "main" }, IDENT);
    expect((spec?.context_refs as { workspace: { ref?: string } }).workspace.ref).toBe("main");
  });
});
