import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalEnv = process.env;

const baseline: Record<string, string> = {
  NODE_ENV: "production",
  CLERK_SECRET_KEY: "sk_test_placeholder",
  RESEND_API_KEY: "re_placeholder",
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: "pk_test_placeholder",
  NEXT_PUBLIC_CLERK_SIGN_IN_URL: "/iniciar-sesion",
  NEXT_PUBLIC_CLERK_SIGN_UP_URL: "/crear-cuenta",
  NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL: "/",
  NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL: "/",
  NEXT_PUBLIC_API_URL: "http://localhost:3001/api/store-id",
  NEXT_PUBLIC_PAYU_URL: "https://sandbox.payu.example",
  NEXT_PUBLIC_PAYU_MERCHANT_ID: "1",
  NEXT_PUBLIC_PAYU_ACCOUNT_ID: "1",
  NEXT_PUBLIC_PAYU_API_KEY: "placeholder",
};

const analytics: Record<string, string> = {
  NEXT_PUBLIC_GA_MEASUREMENT_ID: "G-8X3M77ZB3Z",
  NEXT_PUBLIC_CLARITY_PROJECT_ID: "sc857ich8n",
  NEXT_PUBLIC_CLARITY_ENABLED: "true",
};

async function loadEnv(overrides: Record<string, string | undefined>) {
  vi.resetModules();
  process.env = { ...baseline, ...overrides } as NodeJS.ProcessEnv;
  const loaded = await import("@/lib/env.mjs");
  return loaded.env;
}

describe("storefront env contract", () => {
  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("fails a Vercel production build when the analytics identifiers are missing", async () => {
    await expect(loadEnv({ VERCEL_ENV: "production" })).rejects.toThrow(
      /Invalid environment variables/,
    );
  });

  it("fails a Vercel production build when only some analytics identifiers are present", async () => {
    await expect(
      loadEnv({
        VERCEL_ENV: "production",
        NEXT_PUBLIC_GA_MEASUREMENT_ID: analytics.NEXT_PUBLIC_GA_MEASUREMENT_ID,
      }),
    ).rejects.toThrow(/Invalid environment variables/);
  });

  it("accepts a Vercel production build with valid analytics identifiers", async () => {
    const env = await loadEnv({ VERCEL_ENV: "production", ...analytics });

    expect(env.NEXT_PUBLIC_GA_MEASUREMENT_ID).toBe("G-8X3M77ZB3Z");
    expect(env.NEXT_PUBLIC_CLARITY_PROJECT_ID).toBe("sc857ich8n");
    expect(env.NEXT_PUBLIC_CLARITY_ENABLED).toBe("true");
  });

  it("keeps the identifiers optional for preview, CI, and local builds", async () => {
    for (const overrides of [{ VERCEL_ENV: "preview" }, {}]) {
      const env = await loadEnv(overrides);

      expect(env.NEXT_PUBLIC_GA_MEASUREMENT_ID).toBeUndefined();
      expect(env.NEXT_PUBLIC_CLARITY_PROJECT_ID).toBeUndefined();
    }
  });

  it("still rejects malformed identifiers everywhere", async () => {
    await expect(
      loadEnv({ NEXT_PUBLIC_GA_MEASUREMENT_ID: "UA-12345-1" }),
    ).rejects.toThrow(/Invalid environment variables/);
  });
});
