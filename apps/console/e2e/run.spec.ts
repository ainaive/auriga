import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// A spec whose acceptance criterion (file_exists answer.txt) is exactly what the
// stub runner writes, so the run streams to `done` deterministically.
const jobSpec = (id: string) => ({
  id,
  factio: "default",
  created_by: "e2e",
  goal: "write answer.txt",
  context_refs: { workspace: { kind: "dir", url_or_path: "./fixtures/failing-test" } },
  allowed_tools: ["write_file"],
  acceptance_criteria: [{ kind: "file_exists", path: "answer.txt" }],
  budget: { max_tokens: 100_000, max_wall_time_s: 60, max_cost_usd: 1, max_steps: 10 },
});

async function login(page: Page, role = "admin") {
  await page.goto("/login");
  await page.getByLabel("Factio (tenant)").fill("default");
  await page.getByLabel("Role").selectOption(role);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => u.pathname === "/");
}

async function createJob(page: Page, id: string) {
  await page.goto("/jobs/new");
  await page.getByRole("tab", { name: "Raw JSON" }).click();
  await page.getByPlaceholder("Paste a JobSpec as JSON…").fill(JSON.stringify(jobSpec(id)));
  await page.getByRole("button", { name: "Create job" }).click();
  await page.waitForURL(`**/jobs/${id}`);
}

test("submit → run → watch the live timeline reach done; workspace shows the file", async ({
  page,
}) => {
  await login(page);
  await createJob(page, "e2e_run");

  await expect(page.getByText("pending").first()).toBeVisible();
  await page.getByRole("button", { name: "Run" }).click();

  // The live run streams to a terminal state, then the workspace card shows the file.
  await expect(page.getByText("done").first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("answer.txt").first()).toBeVisible({ timeout: 30_000 });
});

test("cancel a pending job", async ({ page }) => {
  await login(page);
  await createJob(page, "e2e_cancel");
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("cancelled").first()).toBeVisible();
});

test("non-admin sees the config UI read-only", async ({ page }) => {
  await login(page, "viewer");
  await page.goto("/config");
  await expect(page.getByText(/read-only/i)).toBeVisible();
  await expect(page.getByRole("button", { name: "Save config" })).toHaveCount(0);
});

test("core pages have no serious/critical accessibility violations", async ({ page }) => {
  await login(page);
  for (const path of ["/", "/jobs", "/config", "/login"]) {
    await page.goto(path);
    const { violations } = await new AxeBuilder({ page }).analyze();
    const serious = violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, `${path}: ${serious.map((v) => v.id).join(", ")}`).toEqual([]);
  }
});
