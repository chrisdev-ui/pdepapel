import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { e2eServerEnv, withNetworkGuard } from "../../../scripts/lib/e2e-server-env.mjs";
import { TEST_ENV_STUBS } from "../../../scripts/lib/test-isolation.mjs";

/**
 * Ningún modo de las e2e llega a un servicio externo real: el servidor (de
 * desarrollo o de producción) corre con claves de prueba, salvo Clerk de
 * desarrollo, y su red solo alcanza la máquina local y Clerk.
 */
const root = path.resolve(__dirname, "../../..");
const guard = path.join(root, "scripts/lib/e2e-server-network.mjs");
const TEST_DB = "mysql://root:root@127.0.0.1:3307/pdepapel_test";

const runWithGuard = (code: string, env: Record<string, string> = {}) =>
  execFileSync(process.execPath, ["--import", new URL(`file://${guard}`).href, "--input-type=module", "-e", code], {
    encoding: "utf8",
    env: { NODE_ENV: "test", PATH: process.env.PATH ?? "", ...env },
  });

describe("servidor de las e2e aislado", () => {
  it("una petición del servidor a un host real falla con «red bloqueada»", () => {
    const out = runWithGuard(`const r = await fetch("https://papeleriapdepapel.com/api/revalidate", { method: "POST" }).then(() => "conectó", (e) => String(e.cause?.message ?? e.message)); console.log(r);`);
    expect(out).toContain("[pruebas] red bloqueada: papeleriapdepapel.com:443");
  });

  it("con E2E_NETWORK_LOG anota el intento (comando y clave de Upstash, nunca el valor)", () => {
    const log = path.join(mkdtempSync(path.join(tmpdir(), "e2e-net-")), "red.jsonl");
    runWithGuard(
      `await fetch("https://x.upstash.io/pipeline", { method: "POST", body: JSON.stringify([["SET", "idem:tienda:3001234567", "secreto"], ["GET", "store:tienda:active-offers"]]) }).catch(() => null);`,
      { E2E_NETWORK_LOG: log },
    );
    const [entry] = readFileSync(log, "utf8").trim().split("\n").map((line) => JSON.parse(line));
    expect(entry).toMatchObject({ via: "fetch", method: "POST", host: "x.upstash.io", redis: [["SET", "idem:tienda:#"], ["GET", "store:tienda:active-offers"]] });
    expect(JSON.stringify(entry)).not.toContain("secreto");
  });

  it("el entorno: claves de prueba salvo Clerk de desarrollo, sin interruptores, y solo con la base de pruebas", () => {
    const source = {
      NODE_ENV: "development" as const,
      DATABASE_URL: TEST_DB,
      CLERK_SECRET_KEY: "sk_test_dev",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_dev",
      OPENAI_API_KEY: "real-openai",
      KV_REST_API_TOKEN: "real-upstash",
      MIPAQUETE_API_KEY: "real-mipaquete",
      REVALIDATION_SECRET: "real-revalidation",
      TURNSTILE_SECRET_KEY: "real-turnstile",
    };
    const env = e2eServerEnv(source, "prueba");
    expect(env).toMatchObject({
      CLERK_SECRET_KEY: "sk_test_dev",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_dev",
      OPENAI_API_KEY: TEST_ENV_STUBS.OPENAI_API_KEY,
      KV_REST_API_TOKEN: TEST_ENV_STUBS.KV_REST_API_TOKEN,
      MIPAQUETE_API_KEY: TEST_ENV_STUBS.MIPAQUETE_API_KEY,
      REVALIDATION_SECRET: TEST_ENV_STUBS.REVALIDATION_SECRET,
    });
    expect(env).not.toHaveProperty("TURNSTILE_SECRET_KEY");
    expect(withNetworkGuard(env).NODE_OPTIONS).toContain("e2e-server-network.mjs");

    expect(() => e2eServerEnv({ ...source, DATABASE_URL: "mysql://u@db.railway.internal:3306/railway" }, "prueba")).toThrow();
    expect(() => e2eServerEnv({ ...source, CLERK_SECRET_KEY: "sk_live_real" }, "prueba")).toThrow("sk_test_");
  });

  it("los dos modos de Playwright arrancan su propio servidor aislado", () => {
    const config = readFileSync(path.join(root, "playwright.config.ts"), "utf8");
    expect(config).toContain("node scripts/e2e-production-server.mjs");
    expect(config).toContain("node scripts/e2e-dev-server.mjs");
    expect(config).not.toMatch(/command:[^\n]*npm run dev/);
    expect(config).not.toMatch(/reuseExistingServer: !process\.env\.CI/);
  });
});
