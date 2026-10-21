import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { storeServerEnv } from "../../../scripts/lib/e2e-store-env.mjs";

/**
 * Las e2e locales de la tienda no llegan a producción: los dos servidores
 * (administración y tienda) arrancan aislados y ninguno arranca si su entorno
 * trae algo real.
 */
const root = path.resolve(__dirname, "../../..");
const LOCAL_API = "http://localhost:3101/api/e2e-admin-store";

const storeEnvFile = (content: string) => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "e2e-store-env-")), ".env");
  writeFileSync(file, content);
  return file;
};

describe("servidores de las e2e locales de la tienda", () => {
  it("la configuración arranca la administración y la tienda con sus lanzadores aislados, nunca reutilizados", () => {
    const config = readFileSync(path.join(root, "playwright.local.config.ts"), "utf8");
    expect(config).toContain('command: "node scripts/with-e2e-env.mjs node scripts/with-test-env.mjs node scripts/e2e-dev-server.mjs"');
    expect(config).toContain('command: "node scripts/e2e-store-server.mjs"');
    expect(config).not.toMatch(/command:[^\n]*npm run/);
    expect(config).not.toMatch(/reuseExistingServer: !process\.env\.CI/);
  });

  it("todo lo del .env de la tienda pasa a valores de prueba salvo Clerk de desarrollo", () => {
    const appEnvFile = storeEnvFile(
      [
        "CLERK_SECRET_KEY=sk_test_dev",
        "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_dev",
        "NEXT_PUBLIC_CLERK_SIGN_IN_URL=/iniciar-sesion",
        "RESEND_API_KEY=re_valorReal123",
        "NEXT_PUBLIC_API_URL=https://admin.example.test/api/tienda",
        "NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=cuenta-real",
        "NEXT_PUBLIC_CLOUDINARY_PLACEHOLDERS=1",
      ].join("\n"),
    );

    const env = storeServerEnv({ NEXT_PUBLIC_API_URL: LOCAL_API }, { appEnvFile });

    expect(env).toMatchObject({
      CLERK_SECRET_KEY: "sk_test_dev",
      NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_dev",
      NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/iniciar-sesion",
      RESEND_API_KEY: "re_test_stub",
      NEXT_PUBLIC_API_URL: LOCAL_API,
      NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "test-stub",
      NEXT_PUBLIC_CLOUDINARY_PLACEHOLDERS: "0",
    });
  });

  it("no arranca con Clerk de producción ni con algo de producción que venga de otro lado", () => {
    const appEnvFile = storeEnvFile("CLERK_SECRET_KEY=sk_live_real\nNEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_real\n");
    expect(() => storeServerEnv({ NEXT_PUBLIC_API_URL: LOCAL_API }, { appEnvFile })).toThrow("sk_test_");

    const devFile = storeEnvFile("CLERK_SECRET_KEY=sk_test_dev\nNEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_dev\n");
    expect(() =>
      storeServerEnv({ NEXT_PUBLIC_API_URL: LOCAL_API, KV_REST_API_URL: "https://real.upstash.io", GA4_API_SECRET: "secreto" }, { appEnvFile: devFile }),
    ).toThrow(/GA4_API_SECRET \(GA4 MP\), KV_REST_API_URL \(Upstash\)/);
  });

  it("las claves de redes sociales del entorno no llegan a la tienda: pasan a valores de prueba", () => {
    const appEnvFile = storeEnvFile("CLERK_SECRET_KEY=sk_test_dev\nNEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_dev\n");
    const env = storeServerEnv(
      { NEXT_PUBLIC_API_URL: LOCAL_API, META_IG_PAGE_TOKEN: "EAAreal", TIKTOK_CLIENT_KEY: "awreal", TIKTOK_CLIENT_SECRET: "real", SOCIAL_TOKEN_ENCRYPTION_KEY: "cmVhbA==" },
      { appEnvFile },
    );
    expect(env).toMatchObject({ META_IG_PAGE_TOKEN: "test-stub", TIKTOK_CLIENT_KEY: "test-stub", TIKTOK_CLIENT_SECRET: "test-stub" });
    expect(env.SOCIAL_TOKEN_ENCRYPTION_KEY).not.toBe("cmVhbA==");
  });

  it("sin la API local no arranca", () => {
    const appEnvFile = storeEnvFile("CLERK_SECRET_KEY=sk_test_dev\n");
    expect(() => storeServerEnv({}, { appEnvFile })).toThrow("NEXT_PUBLIC_API_URL");
  });
});
