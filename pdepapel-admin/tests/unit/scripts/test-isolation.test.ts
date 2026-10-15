import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ABSENT_IN_TESTS, isAllowedHost, isLocalHost, NOT_STUBBED, TEST_ENV_STUBS, testEnvStubs } from "../../../scripts/lib/test-isolation.mjs";

/**
 * Las pruebas no usan claves reales ni salen a la red. Lo que importa: un
 * import de `@prisma/client` no trae el `.env` de producción, una llamada a un
 * host real falla con el error del arnés, y la red local sigue funcionando.
 */
const root = path.resolve(__dirname, "../../..");

const SECRET_LIKE = /(KEY|SECRET|TOKEN|PASSWORD|_URL|_URI|_ID|_SN|_TAG|SENDER_|_IDENTITY)/;

describe("claves dobladas", () => {
  it("toda variable de lib/env.mjs tiene un valor de prueba, salvo las que pone el arnés", () => {
    const source = readFileSync(path.join(root, "lib/env.mjs"), "utf8");
    const names = Array.from(source.matchAll(/^\s+([A-Z][A-Z0-9_]+):/gm), (match) => match[1]);
    const missing = names.filter((name) => !NOT_STUBBED.has(name) && !ABSENT_IN_TESTS.includes(name) && !(name in TEST_ENV_STUBS));
    expect(missing).toEqual([]);
  });

  it("toda clave externa que el código lee de process.env tiene un valor de prueba", () => {
    const files = execFileSync("git", ["ls-files", "lib", "app", "actions", "middleware.ts", "providers", "hooks", "components"], { cwd: root, encoding: "utf8" })
      .split("\n")
      .filter((file) => /\.(ts|tsx|mjs)$/.test(file));
    const names = new Set<string>();
    for (const file of files) {
      const source = readFileSync(path.join(root, file), "utf8");
      for (const match of Array.from(source.matchAll(/process\.env(?:\.([A-Z][A-Z0-9_]+)|\["([A-Z][A-Z0-9_]+)"\])/g))) names.add(match[1] ?? match[2]);
    }
    const harmless = new Set(["NEXT_PUBLIC_BUILD_SHA", "NEXT_PUBLIC_FRONTEND_STORE_URL", "NEXT_PUBLIC_STOREFRONT_URL", "STOREFRONT_URL", "VERCEL_ENV", "VERCEL_GIT_COMMIT_SHA", "STORE_CONTACT_EMAIL"]);
    const missing = Array.from(names).filter((name) => SECRET_LIKE.test(name) && !harmless.has(name) && !NOT_STUBBED.has(name) && !ABSENT_IN_TESTS.includes(name) && !(name in TEST_ENV_STUBS));
    expect(missing).toEqual([]);
  });

  it("los nombres de un .env que no están en la lista también se tapan (solo se leen los nombres)", () => {
    const envFile = path.join(root, "tests/fixtures/test-isolation.env");
    const stubs: Record<string, string> = testEnvStubs(envFile);
    expect(stubs.SOME_NEW_PROVIDER_TOKEN).toBe("test-stub");
    expect(stubs.OPENAI_API_KEY).toBe(TEST_ENV_STUBS.OPENAI_API_KEY);
    expect(stubs).not.toHaveProperty("DATABASE_URL");
    expect(stubs).not.toHaveProperty("NODE_ENV");
    expect(Object.values(stubs)).not.toContain("valor-que-no-debe-salir");
  });

  it("las evaluaciones del copiloto no cargan el bloqueo de red ni las claves de prueba", () => {
    const config = readFileSync(path.join(root, "scripts/copilot-eval/vitest.config.mts"), "utf8");
    expect(config).not.toContain("setup-isolation");
    expect(config).not.toContain("testEnvStubs");
  });

  it("los interruptores quedan sin definir, como en CI", () => {
    for (const name of ABSENT_IN_TESTS) expect(process.env[name], name).toBeUndefined();
  });

  it("en esta corrida las claves son las de prueba, también después de importar Prisma", async () => {
    expect(process.env.OPENAI_API_KEY).toBe(TEST_ENV_STUBS.OPENAI_API_KEY);
    expect(process.env.RESEND_API_KEY).toBe(TEST_ENV_STUBS.RESEND_API_KEY);
    await import("@prisma/client");
    for (const name of ["OPENAI_API_KEY", "GEMINI_API_KEY", "WHATSAPP_ACCESS_TOKEN", "MERCADOLIBRE_CLIENT_SECRET", "QSTASH_TOKEN", "CLERK_SECRET_KEY", "CLOUDINARY_API_SECRET", "CLOUDFLARE_R2_SECRET_ACCESS_KEY", "RESEND_API_KEY", "CHAKRA_API_KEY"]) {
      expect(process.env[name], name).toBe(TEST_ENV_STUBS[name as keyof typeof TEST_ENV_STUBS]);
    }
  });
});

describe("red bloqueada fuera de la máquina local", () => {
  let server: http.Server;
  let port = 0;

  beforeAll(async () => {
    server = http.createServer((_req, res) => res.end("ok-local"));
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("fetch a un host real falla con el error del arnés", async () => {
    const error = await fetch("https://api.openai.com/v1/models").then(
      () => null,
      (reason: Error & { cause?: Error }) => reason,
    );
    expect(error).not.toBeNull();
    expect(String(error?.cause?.message ?? error?.message)).toContain("[pruebas] red bloqueada: api.openai.com:443");
  });

  it("http y https a un host real también fallan (axios y los SDK que no usan fetch)", async () => {
    const attempt = (client: typeof http | typeof https, url: string) =>
      new Promise<Error>((resolve) => {
        const request = client.get(url, () => resolve(new Error("conectó")));
        request.on("error", resolve);
      });
    await expect(attempt(https, "https://graph.facebook.com/v21.0/me")).resolves.toMatchObject({ code: "E_TEST_NETWORK_BLOCKED" });
    await expect(attempt(http, "http://example.com/")).resolves.toMatchObject({ code: "E_TEST_NETWORK_BLOCKED" });
  });

  it("la red local sigue abierta", async () => {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    await expect(response.text()).resolves.toBe("ok-local");
    const viaName = await fetch(`http://localhost:${port}/`).catch(() => null);
    if (viaName) await expect(viaName.text()).resolves.toBe("ok-local");
  });

  it("el servidor de las e2e solo deja salir a Clerk de desarrollo", () => {
    const clerk = ["clerk.accounts.dev", "api.clerk.com", "api.clerk.dev"];
    for (const host of ["glowing-tarpon-88.clerk.accounts.dev", "api.clerk.com", "api.clerk.dev"]) expect(isAllowedHost(host, clerk), host).toBe(true);
    for (const host of ["papeleriapdepapel.com", "api.openai.com", "evilclerk.accounts.dev.com", "clerk.accounts.dev.evil.com", "graph.facebook.com"]) expect(isAllowedHost(host, clerk), host).toBe(false);
    expect(isAllowedHost("api.clerk.com")).toBe(false);
  });

  it("qué cuenta como local", () => {
    for (const host of ["localhost", "127.0.0.1", "127.0.1.1", "::1", "[::1]", "app.localhost"]) expect(isLocalHost(host), host).toBe(true);
    for (const host of ["api.openai.com", "10.0.0.5", "192.168.1.10", "localhost.evil.com", "8.8.8.8"]) expect(isLocalHost(host), host).toBe(false);
  });
});
