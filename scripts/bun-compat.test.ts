/**
 * Bun-compatibility spike (plan Risk: "Bun ecosystem rough edges").
 *
 * Confirms the three watch-item dependencies LOAD under Bun without a live
 * database. Full connection tests run later once Postgres is up via docker-compose.
 * If any of these ever fail under Bun, the fallback is to run apps/worker on Node
 * while keeping the rest on Bun (see plan §1, decision 3).
 */
import { test, expect } from "bun:test";

test("graphile-worker loads under Bun", async () => {
  const gw = await import("graphile-worker");
  expect(typeof gw.run).toBe("function");
  expect(typeof gw.makeWorkerUtils).toBe("function");
});

test("pg driver loads under Bun", async () => {
  const pg = (await import("pg")) as unknown as {
    Client?: unknown;
    Pool?: unknown;
    default?: { Client?: unknown; Pool?: unknown };
  };
  const Client = pg.Client ?? pg.default?.Client;
  const Pool = pg.Pool ?? pg.default?.Pool;
  expect(typeof Client).toBe("function");
  expect(typeof Pool).toBe("function");
});

test("OpenTelemetry loads under Bun", async () => {
  const sdk = await import("@opentelemetry/sdk-node");
  expect(typeof sdk.NodeSDK).toBe("function");
  const api = await import("@opentelemetry/api");
  expect(api.trace).toBeDefined();
});
