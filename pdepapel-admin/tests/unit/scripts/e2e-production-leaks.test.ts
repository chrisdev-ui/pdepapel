import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { assertNoProductionLeaks, findProductionLeaks } from "../../../scripts/lib/e2e-production-leaks.mjs";
import { e2eServerEnv } from "../../../scripts/lib/e2e-server-env.mjs";
import { TEST_ENV_STUBS } from "../../../scripts/lib/test-isolation.mjs";

const TEST_DB = "mysql://root:root@127.0.0.1:3307/pdepapel_test";

const appEnv = (content: string) => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "e2e-leaks-")), ".env");
  writeFileSync(file, content);
  return file;
};

describe("ningún servidor de las e2e arranca con algo de producción", () => {
  it("un valor heredado del .env real se detecta por nombre, sin mostrar el valor", () => {
    const file = appEnv("RESEND_API_KEY=valor-real-de-correo\nCLERK_SECRET_KEY=sk_test_dev\nNEXT_PUBLIC_CLERK_SIGN_IN_URL=/iniciar-sesion\n");
    const leaks = findProductionLeaks(
      { RESEND_API_KEY: "valor-real-de-correo", CLERK_SECRET_KEY: "sk_test_dev", NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/iniciar-sesion" },
      { appEnvFiles: [file] },
    );
    expect(leaks).toEqual(["RESEND_API_KEY (valor del .env real)"]);
    expect(leaks.join()).not.toContain("valor-real-de-correo");
  });

  it.each([
    ["KV_REST_API_URL", "https://algo-123.upstash.io", "Upstash"],
    ["UPSTASH_REDIS_REST_URL", "https://algo.upstash.io", "Upstash"],
    ["RESEND_API_KEY", "re_AbCdEf123", "Resend"],
    ["CLERK_SECRET_KEY", "sk_live_abc", "Clerk live"],
    ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_live_abc", "Clerk live"],
    ["WHATSAPP_ACCESS_TOKEN", "otro-token", "Meta"],
    ["META_CONVERSIONS_TOKEN", "EAAB1234567890123456789012", "token de Meta"],
    ["META_IG_PAGE_TOKEN", "token-de-pagina", "Meta"],
    ["META_IG_PAGE_TOKEN", "EAAB1234567890123456789012", "token de Meta"],
    ["TIKTOK_CLIENT_KEY", "awclavereal", "TikTok"],
    ["TIKTOK_CLIENT_SECRET", "secreto-tiktok", "TikTok"],
    ["SOCIAL_TOKEN_ENCRYPTION_KEY", "b3RyYS1sbGF2ZS1kZS0zMi1ieXRlcy1wYXJhLXJlZGVz", "llave de tokens de redes"],
    ["GA4_API_SECRET", "secreto-ga4", "GA4 MP"],
    ["MIPAQUETE_API_KEY", "clave-mipaquete", "MiPaquete"],
    ["BOLD_ENVIRONMENT", "production", "Bold fuera de pruebas"],
    ["DATABASE_URL", "mysql://u:p@db.rlwy.net:3306/railway", "base de producción"],
    ["COPILOT_DATABASE_URL", "mysql://u:p@10.0.0.5:3306/pdepapel", "base que no es pdepapel_test local"],
  ])("%s con forma de producción", (name, value, reason) => {
    expect(findProductionLeaks({ [name]: value })).toContain(`${name} (${reason})`);
  });

  it("los valores de prueba pasan", () => {
    expect(
      findProductionLeaks({
        KV_REST_API_URL: "https://upstash.stub.invalid",
        KV_URL: "redis://127.0.0.1:6399",
        RESEND_API_KEY: "re_test_stub",
        GA4_API_SECRET: "test-stub",
        MIPAQUETE_API_KEY: "test-stub",
        WHATSAPP_ACCESS_TOKEN: "test-stub",
        WHATSAPP_WEBHOOK_VERIFY_TOKEN: "test-stub-whatsapp-verify-token",
        META_CATALOG_FEED_SECRET: "test-stub-meta-catalog-feed-secret",
        META_IG_PAGE_TOKEN: TEST_ENV_STUBS.META_IG_PAGE_TOKEN,
        TIKTOK_CLIENT_KEY: TEST_ENV_STUBS.TIKTOK_CLIENT_KEY,
        TIKTOK_CLIENT_SECRET: TEST_ENV_STUBS.TIKTOK_CLIENT_SECRET,
        TIKTOK_REDIRECT_URI: TEST_ENV_STUBS.TIKTOK_REDIRECT_URI,
        SOCIAL_TOKEN_ENCRYPTION_KEY: TEST_ENV_STUBS.SOCIAL_TOKEN_ENCRYPTION_KEY,
        BOLD_ENVIRONMENT: "test",
        DATABASE_URL: TEST_DB,
        CLERK_SECRET_KEY: "sk_test_dev",
      }),
    ).toEqual([]);
  });

  it("un valor de prueba igual al del .env (BOLD_ENVIRONMENT=test) no cuenta como herencia", () => {
    const file = appEnv("BOLD_ENVIRONMENT=test\n");
    expect(findProductionLeaks({ BOLD_ENVIRONMENT: "test" }, { appEnvFiles: [file], stubs: { BOLD_ENVIRONMENT: "test" } })).toEqual([]);
    expect(findProductionLeaks({ BOLD_ENVIRONMENT: "test" }, { appEnvFiles: [file] })).toEqual(["BOLD_ENVIRONMENT (valor del .env real)"]);
  });

  it("assertNoProductionLeaks corta la corrida con los nombres", () => {
    expect(() => assertNoProductionLeaks({ RESEND_API_KEY: "re_real123" }, { context: "tienda" })).toThrow(
      "[tienda] El servidor de las e2e traería datos de producción; no arranca: RESEND_API_KEY (Resend)",
    );
  });

  it("el entorno del servidor de la administración la pasa y la aplica", () => {
    const source = { NODE_ENV: "development" as const, DATABASE_URL: TEST_DB, CLERK_SECRET_KEY: "sk_test_dev", NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_dev" };
    expect(() => e2eServerEnv(source, "prueba")).not.toThrow();
    expect(() => e2eServerEnv({ ...source, OTRO_REDIS_REST_URL: "https://real.upstash.io" }, "prueba")).toThrow("OTRO_REDIS_REST_URL (Upstash)");
  });
});
