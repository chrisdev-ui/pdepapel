import axios, { AxiosError, AxiosHeaders } from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { describeRevalidationFailure, triggerStorefrontRevalidation } from "@/lib/revalidate-store";
import { sendRevalidationFailureAlert } from "@/lib/revalidation-alert";

vi.mock("axios", async (importOriginal) => {
  const actual = await importOriginal<typeof import("axios")>();
  return {
    ...actual,
    default: { post: vi.fn() },
  };
});

vi.mock("@/lib/job-runs", () => ({
  recordJobRun: vi.fn().mockResolvedValue(undefined),
}));

/** Error de axios con respuesta HTTP, tal como lo produce una llamada real. */
const httpError = (status: number, headers: Record<string, string> = {}, data?: unknown) => {
  const error = new AxiosError(`Request failed with status code ${status}`, "ERR_BAD_REQUEST");
  error.response = { status, statusText: "", headers: new AxiosHeaders(headers), config: { headers: new AxiosHeaders() }, data };
  return error;
};

vi.mock("@/lib/revalidation-alert", () => ({
  sendRevalidationFailureAlert: vi.fn(),
}));

const originalSecret = process.env.REVALIDATION_SECRET;
const originalStorefrontUrl = process.env.STOREFRONT_URL;
const originalPublicStorefrontUrl = process.env.NEXT_PUBLIC_STOREFRONT_URL;

describe("storefront revalidation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STOREFRONT_URL = "https://papeleriapdepapel.com";
    delete process.env.NEXT_PUBLIC_STOREFRONT_URL;
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.REVALIDATION_SECRET;
    else process.env.REVALIDATION_SECRET = originalSecret;

    if (originalStorefrontUrl === undefined) delete process.env.STOREFRONT_URL;
    else process.env.STOREFRONT_URL = originalStorefrontUrl;

    if (originalPublicStorefrontUrl === undefined) {
      delete process.env.NEXT_PUBLIC_STOREFRONT_URL;
    } else {
      process.env.NEXT_PUBLIC_STOREFRONT_URL = originalPublicStorefrontUrl;
    }
  });

  it("trims an accidental line break before sending the revalidation header", async () => {
    process.env.REVALIDATION_SECRET = "shared-secret\n";
    vi.mocked(axios.post).mockResolvedValue({ data: { revalidated: true } });

    await triggerStorefrontRevalidation({ productId: "agenda-floral" });

    expect(axios.post).toHaveBeenCalledWith(
      "https://papeleriapdepapel.com/api/revalidate",
      expect.objectContaining({ productId: "agenda-floral" }),
      expect.objectContaining({
        headers: expect.objectContaining({
          "x-revalidate-secret": "shared-secret",
        }),
      }),
    );
    expect(sendRevalidationFailureAlert).not.toHaveBeenCalled();
  });

  it("names the Vercel firewall when the store answers with a challenge instead of running the route", async () => {
    process.env.REVALIDATION_SECRET = "shared-secret";
    vi.mocked(axios.post).mockRejectedValue(httpError(429, { "x-vercel-mitigated": "challenge" }));

    await triggerStorefrontRevalidation({ productId: "agenda-floral" });

    // Un desafío no se reintenta: la segunda llamada tampoco lo resolvería.
    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(sendRevalidationFailureAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        endpoints: ["https://papeleriapdepapel.com/api/revalidate"],
        details: [expect.stringContaining("firewall de Vercel")],
      }),
    );
    const detail = vi.mocked(sendRevalidationFailureAlert).mock.calls[0][0].details[0];
    expect(detail).toContain("HTTP 429");
    expect(detail).toContain("bypass");
    expect(detail).toContain("/api/revalidate");
  });

  it("retries once on a transient failure and stays quiet when the retry succeeds", async () => {
    process.env.REVALIDATION_SECRET = "shared-secret";
    vi.mocked(axios.post).mockRejectedValueOnce(httpError(503)).mockResolvedValueOnce({ data: { revalidated: true } });

    await triggerStorefrontRevalidation();

    expect(axios.post).toHaveBeenCalledTimes(2);
    expect(sendRevalidationFailureAlert).not.toHaveBeenCalled();
  });

  it("does not retry a 4xx and reports the store's message", async () => {
    process.env.REVALIDATION_SECRET = "shared-secret";
    vi.mocked(axios.post).mockRejectedValue(httpError(401, {}, { message: "Clave de revalidación inválida" }));

    await triggerStorefrontRevalidation();

    expect(axios.post).toHaveBeenCalledTimes(1);
    expect(sendRevalidationFailureAlert).toHaveBeenCalledWith(
      expect.objectContaining({ details: ["HTTP 401 (Clave de revalidación inválida)"] }),
    );
  });

  it("describes non-HTTP failures plainly", () => {
    expect(describeRevalidationFailure(new Error("boom"))).toBe("boom");
    const timeout = new AxiosError("timeout of 3000ms exceeded", "ECONNABORTED");
    expect(describeRevalidationFailure(timeout)).toBe("Sin respuesta en 3000 ms");
  });

  it("stops before making an invalid HTTP header", async () => {
    process.env.REVALIDATION_SECRET = "shared\nsecret";

    await triggerStorefrontRevalidation();

    expect(axios.post).not.toHaveBeenCalled();
    expect(sendRevalidationFailureAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        details: [
          "Storefront revalidation skipped: REVALIDATION_SECRET must be a single-line printable value.",
        ],
      }),
    );
  });
});
