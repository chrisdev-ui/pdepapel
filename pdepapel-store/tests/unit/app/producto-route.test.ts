import { beforeEach, describe, expect, it, vi } from "vitest";

import { UpstreamServiceError } from "@/lib/upstream-service-error";

const mocks = vi.hoisted(() => ({ getProduct: vi.fn() }));

vi.mock("@/actions/get-product", () => ({ getProduct: mocks.getProduct }));

import { GET, dynamic } from "@/app/api/producto/[slug]/route";
import { sanitizeRichTextHtml } from "@/lib/rich-text";

const call = (slug: string) =>
  GET(new Request(`https://papeleriapdepapel.com/api/producto/${slug}`), { params: { slug } });

const dirty = '<p>Hola <strong>mundo</strong></p><script>alert(1)</script><img src=x onerror="alert(1)">';

describe("/api/producto/[slug]", () => {
  beforeEach(() => vi.clearAllMocks());

  it("nunca se prerenderiza: es el stock y el precio de la variante que se acaba de tocar", () => {
    expect(dynamic).toBe("force-dynamic");
  });

  it("devuelve el producto con la descripción saneada en el servidor y sin caché", async () => {
    mocks.getProduct.mockResolvedValue({ id: "p1", slug: "agenda", description: dirty, price: "25000" });
    const response = await call("agenda");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const body = await response.json();
    expect(mocks.getProduct).toHaveBeenCalledWith("agenda");
    expect(body.description).toBe(sanitizeRichTextHtml(dirty));
    expect(body.description).not.toContain("script");
    expect(body).toMatchObject({ id: "p1", slug: "agenda", price: "25000" });
  });

  it("404 cuando el catálogo no lo conoce", async () => {
    mocks.getProduct.mockResolvedValue(null);
    const response = await call("no-existe");
    expect(response.status).toBe(404);
  });

  it("503 cuando el catálogo no contesta, 500 ante cualquier otra cosa", async () => {
    mocks.getProduct.mockRejectedValueOnce(new UpstreamServiceError("el catálogo", 502));
    expect((await call("agenda")).status).toBe(503);
    mocks.getProduct.mockRejectedValueOnce(new Error("boom"));
    expect((await call("agenda")).status).toBe(500);
  });
});
