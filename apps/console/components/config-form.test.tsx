import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ConfigForm } from "@/components/config-form";
import type { AurigaConfig } from "@/lib/api";

// ConfigForm is a client component; stub the Next router + the server action so it
// renders in jsdom without the App Router / server runtime.
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/actions", () => ({ saveConfig: vi.fn() }));

const initial: AurigaConfig = {
  policies: [{ factio: "acme", roles: ["dev"] }],
  quotas: { global: 2, perFactio: 1 },
};

describe("ConfigForm role gating", () => {
  it("admin (canEdit) shows Save and enabled inputs", () => {
    render(<ConfigForm initial={initial} canEdit />);
    expect(screen.getByRole("button", { name: /save config/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Global concurrency")).not.toBeDisabled();
  });

  it("non-admin (read-only) hides Save and disables inputs", () => {
    render(<ConfigForm initial={initial} canEdit={false} />);
    expect(screen.queryByRole("button", { name: /save config/i })).toBeNull();
    expect(screen.getByText(/read-only/i)).toBeInTheDocument();
    expect(screen.getByLabelText("Global concurrency")).toBeDisabled();
  });
});
