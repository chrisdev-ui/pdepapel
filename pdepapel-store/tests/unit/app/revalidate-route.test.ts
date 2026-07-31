import { afterEach, describe, expect, it, vi } from "vitest";

import { POST } from "@/app/api/revalidate/route";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
}));

const originalSecret = process.env.REVALIDATION_SECRET;

describe("revalidation route", () => {
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.REVALIDATION_SECRET;
    else process.env.REVALIDATION_SECRET = originalSecret;
  });

  it("accepts the shared secret when Vercel includes a trailing line break", async () => {
    process.env.REVALIDATION_SECRET = "shared-secret\n";

    const response = await POST(
      new Request("http://localhost/api/revalidate", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-revalidate-secret": "shared-secret",
        },
        body: JSON.stringify({ path: "/tienda" }),
      }) as never,
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      revalidated: true,
      paths: expect.arrayContaining(["/tienda"]),
    });
  });
});
