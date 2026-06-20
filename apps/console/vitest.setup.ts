import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import "@testing-library/jest-dom/vitest";

// Unmount React trees between tests (no `globals: true`, so RTL won't auto-register this).
afterEach(() => cleanup());
