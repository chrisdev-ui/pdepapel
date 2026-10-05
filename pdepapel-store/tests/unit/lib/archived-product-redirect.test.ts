import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  cache: <T,>(fn: T) => fn,
}));
vi.mock("@/lib/env.mjs", () => ({ env: { NEXT_PUBLIC_API_URL: "https://admin.test/api/store" } }));

import { getProductRoute } from "@/actions/get-product";
import { archivedProductRedirectPath, UNAVAILABLE_PRODUCT_HASH } from "@/lib/archived-product-redirect";

/** Política del 2026-10-05: un producto archivado lleva a lo más parecido, no a un 404. */
describe("archivedProductRedirectPath", () => {
  it.each([
    [{ kind: "product", slug: "termo-owala-negro" }, "/producto/termo-owala-negro"],
    [{ kind: "category", slug: "termos" }, "/categoria/termos"],
    [{ kind: "type", id: "type 1" }, "/tienda?typeId=type%201"],
    [{ kind: "shop" }, "/tienda"],
  ] as const)("%o → %s with the notice fragment", (redirect, path) => {
    expect(archivedProductRedirectPath(redirect)).toBe(`${path}#${UNAVAILABLE_PRODUCT_HASH}`);
  });
});

describe("getProductRoute", () => {
  afterEach(() => vi.unstubAllGlobals());
  const respond = (status: number, body: unknown) =>
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status })));

  it("returns the product when it is live", async () => {
    respond(200, { id: "p1", slug: "agenda" });
    await expect(getProductRoute("agenda-viva")).resolves.toEqual({ product: { id: "p1", slug: "agenda" } });
  });

  it("returns the redirect the admin computed for an archived product", async () => {
    respond(404, { message: "Producto no disponible", redirect: { kind: "category", slug: "termos" } });
    await expect(getProductRoute("termo-owala-rojo")).resolves.toEqual({ redirect: { kind: "category", slug: "termos" } });
  });

  it("is a real 404 (null) when the product never existed or the redirect is malformed", async () => {
    respond(404, { message: "Producto no encontrado" });
    await expect(getProductRoute("no-existe")).resolves.toBeNull();
    respond(404, { redirect: { kind: "category", slug: "" } });
    await expect(getProductRoute("malformado")).resolves.toBeNull();
  });
});
