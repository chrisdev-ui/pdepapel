import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = process.env;

const baseline: Record<string, string> = {
  NODE_ENV: "production",
  CLERK_SECRET_KEY: "sk_test_placeholder",
  DATABASE_URL: "mysql://root:root@127.0.0.1:3306/pdepapel_test",
  FRONTEND_STORE_URL: "http://localhost:3000",
  ADMIN_WEB_URL: "http://localhost:3001",
  CLOUDINARY_CLOUD_NAME: "cloud",
  CLOUDINARY_API_KEY: "key",
  CLOUDINARY_API_SECRET: "secret",
  WOMPI_API_URL: "https://sandbox.wompi.example",
  WOMPI_API_KEY: "key",
  WOMPI_API_SECRET: "secret",
  WOMPI_EVENTS_KEY: "events",
  WOMPI_INTEGRITY_KEY: "integrity",
  RESEND_API_KEY: "re_placeholder",
  CRON_SECRET: "cron",
  INTERNAL_API_SECRET: "internal",
  ENVIOCLICK_API_KEY: "envioclick",
  MIPAQUETE_API_KEY: "mipaquete",
  KV_REST_API_URL: "https://kv.example",
  KV_REST_API_TOKEN: "token",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_placeholder",
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/iniciar-sesion",
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/crear-cuenta",
  NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: "/",
  NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: "/",
  NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME: "cloud",
};

const analytics: Record<string, string> = {
  GA4_MEASUREMENT_ID: "G-8X3M77ZB3Z",
  GA4_API_SECRET: "measurement-protocol-secret",
};

async function loadEnv(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  process.env = { ...baseline, ...overrides } as NodeJS.ProcessEnv;
  const loaded = await import("@/lib/env.mjs");
  return loaded.env;
}

describe("admin env contract", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("fails a Vercel production build when the GA4 Measurement Protocol credentials are missing", async () => {
    await expect(loadEnv({ VERCEL_ENV: "production" })).rejects.toThrow(
      /Invalid environment variables/,
    );
    await expect(
      loadEnv({
        VERCEL_ENV: "production",
        GA4_MEASUREMENT_ID: analytics.GA4_MEASUREMENT_ID,
      }),
    ).rejects.toThrow(/Invalid environment variables/);
  });

  it("accepts a Vercel production build with the credentials present", async () => {
    const env = await loadEnv({ VERCEL_ENV: "production", ...analytics });

    expect(env.GA4_MEASUREMENT_ID).toBe("G-8X3M77ZB3Z");
    expect(env.GA4_API_SECRET).toBe("measurement-protocol-secret");
  });

  it("keeps the credentials optional for preview, CI, and local builds", async () => {
    for (const overrides of [{ VERCEL_ENV: "preview" }, {}]) {
      const env = await loadEnv(overrides);

      expect(env.GA4_MEASUREMENT_ID).toBeUndefined();
      expect(env.GA4_API_SECRET).toBeUndefined();
    }
  });

  it("still rejects a malformed measurement ID everywhere", async () => {
    await expect(
      loadEnv({ GA4_MEASUREMENT_ID: "UA-12345-1" }),
    ).rejects.toThrow(/Invalid environment variables/);
  });
});
