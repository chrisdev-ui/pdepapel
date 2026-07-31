import axios from "axios";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { triggerStorefrontRevalidation } from "@/lib/revalidate-store";
import { sendRevalidationFailureAlert } from "@/lib/revalidation-alert";

vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
  },
}));

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
