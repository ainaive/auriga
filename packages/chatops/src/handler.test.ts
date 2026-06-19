import { expect, test } from "bun:test";
import type { JobSpec } from "@auriga/core";
import { InMemoryJobStore, InMemoryPolicy, type Actor } from "@auriga/habenae";
import { parseCommand } from "./commands";
import { handleCommand, type ChatContext } from "./handler";

const policy = new InMemoryPolicy([{ factio: "acme", roles: ["dev"] }]);
const actor: Actor = { factio: "acme", role: "dev" };

function ctx(store: InMemoryJobStore): ChatContext {
  return { store, policy, actor };
}

function specJson(id: string, factio = "acme"): string {
  return JSON.stringify({
    id,
    factio,
    created_by: "u",
    goal: "do the thing",
    context_refs: { workspace: { kind: "dir", url_or_path: "/repo" } },
    allowed_tools: ["write_file"],
    acceptance_criteria: [{ kind: "file_exists", path: "x" }],
    budget: { max_tokens: 1000, max_wall_time_s: 60, max_cost_usd: 1, max_steps: 10 },
  });
}

async function run(store: InMemoryJobStore, text: string) {
  return handleCommand(parseCommand(text), ctx(store));
}

test("submit → list → status → approve flow", async () => {
  const store = new InMemoryJobStore();

  const submitted = await run(store, `submit ${specJson("job_1")}`);
  expect(submitted.text).toContain("submitted job_1");

  const listed = await run(store, "list");
  expect(listed.text).toContain("job_1");

  const status = await run(store, "status job_1");
  expect(status.text).toContain("job_1: pending");

  const approved = await run(store, "approve job_1");
  expect(approved.text).toBe("approved job_1");
  expect((await store.get("job_1"))?.approved).toBe(true);
});

test("a policy-denied submit reports the denial", async () => {
  const store = new InMemoryJobStore();
  // role "dev" allowed; submit to a different factio than the actor → denied
  const reply = await run(store, `submit ${specJson("job_x", "rival")}`);
  expect(reply.text).toContain("denied:");
});

test("cross-tenant status is hidden", async () => {
  const store = new InMemoryJobStore();
  await store.create(JSON.parse(specJson("other", "rival")) as JobSpec);
  const reply = await run(store, "status other");
  expect(reply.text).toBe("job not found: other");
});

test("help lists the commands", async () => {
  const reply = await run(new InMemoryJobStore(), "help");
  expect(reply.text).toContain("list");
  expect(reply.text).toContain("approve");
});
