import { afterEach, describe, expect, it, vi } from "vitest";
import { revalidateTag } from "next/cache";

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
    vi.clearAllMocks();
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
    expect(revalidateTag).toHaveBeenCalledWith("products");
    expect(revalidateTag).toHaveBeenCalledWith("catalog");
  });
});

const scopedRequest = (body: Record<string, unknown>) =>
  POST(
    new Request("http://localhost/api/revalidate", {
      method: "POST",
      headers: { "content-type": "application/json", "x-revalidate-secret": "shared-secret" },
      body: JSON.stringify({ version: 2, ...body }),
    }) as never,
  );

describe("scoped revalidation (version 2)", () => {
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.REVALIDATION_SECRET;
    else process.env.REVALIDATION_SECRET = originalSecret;
    vi.clearAllMocks();
  });

  it("purges only the tags and paths it receives, never the global catalog", async () => {
    process.env.REVALIDATION_SECRET = "shared-secret";
    const { revalidatePath } = await import("next/cache");
    const response = await scopedRequest({
      tags: ["product:cuaderno-rosa", "products:category:cat-1", "products:list"],
      paths: ["/producto/cuaderno-rosa", "/tienda", "/categoria/cuadernos"],
    });

    expect(response.status).toBe(200);
    expect(vi.mocked(revalidateTag).mock.calls.map(([tag]) => tag)).toEqual([
      "product:cuaderno-rosa",
      "products:category:cat-1",
      "products:list",
    ]);
    expect(vi.mocked(revalidatePath).mock.calls.map(([path]) => path)).toEqual([
      "/producto/cuaderno-rosa",
      "/tienda",
      "/catalogo-cache/tienda",
      "/categoria/cuadernos",
      "/catalogo-cache/categoria/cuadernos",
    ]);
  });

  it("rejects unknown tags and purges nothing", async () => {
    process.env.REVALIDATION_SECRET = "shared-secret";
    const response = await scopedRequest({ tags: ["product:ok", "anything-else"] });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({ rejected: ["anything-else"] });
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("caps the number of tags", async () => {
    process.env.REVALIDATION_SECRET = "shared-secret";
    const tags = Array.from({ length: 201 }, (_, index) => `product:p-${index}`);
    expect((await scopedRequest({ tags })).status).toBe(400);
    expect(revalidateTag).not.toHaveBeenCalled();
  });

  it("still needs the shared secret", async () => {
    process.env.REVALIDATION_SECRET = "another-secret";
    expect((await scopedRequest({ tags: ["products:list"] })).status).toBe(401);
    expect(revalidateTag).not.toHaveBeenCalled();
  });
});
