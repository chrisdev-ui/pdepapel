import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getMercadoLibreAccessToken: vi.fn().mockResolvedValue("access-token"),
  requestMercadoLibreJson: vi.fn(async (_connectionId: string, resource: string, request: typeof fetch) => {
    const response = await request(`https://api.mercadolibre.com${resource}`, { cache: "no-store" });
    const text = await response.text();
    const payload = text ? (JSON.parse(text) as unknown) : null;
    return { ok: response.ok && payload !== null, status: response.status, payload };
  }),
}));

vi.mock("@/lib/prismadb", () => ({ default: { productPresale: { count: vi.fn().mockResolvedValue(0) } } }));
vi.mock("@/lib/mercadolibre/client", () => ({
  getMercadoLibreAccessToken: mocks.getMercadoLibreAccessToken,
  requestMercadoLibreJson: mocks.requestMercadoLibreJson,
}));

import { validateMercadoLibreItemDraft } from "@/lib/mercadolibre/listings";

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const category = () => json({ id: "MCO441243", children_categories: [], settings: { listing_allowed: true, item_conditions: ["new"], max_title_length: 60, max_pictures_per_item: 12 } });
const attributes = () =>
  json([
    { id: "MANUFACTURER", name: "Fabricante", tags: { required: true } },
    { id: "MODEL", name: "Modelo", tags: { required: true } },
  ]);

const draft = (attributes: { id: string; value_name: string }[]) =>
  ({
    id: "listing-1",
    connectionId: "conn-1",
    categoryId: "MCO441243",
    listingType: "gold_special",
    marketplacePrice: 45_000,
    stockSafetyBuffer: 0,
    metadata: { familyName: "Bitácora-Agenda William Morris", attributes, saleConditions: { shippingMode: "me2", freeShipping: false, localPickUp: false } },
    product: {
      id: "product-1",
      name: "Agendas Flores Azul",
      description: "",
      stock: 1,
      sku: "AGE-FLO-AZU",
      brand: null,
      gtin: null,
      mpn: null,
      isArchived: false,
      hasNoProductIdentifier: true,
      images: [{ url: "https://res.cloudinary.com/demo/image/upload/a.jpg" }],
    },
  }) as never;

describe("validateMercadoLibreItemDraft", () => {
  it("asks Mercado Libre to validate the same payload without creating anything; warnings alone pass", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(category())
      .mockResolvedValueOnce(attributes())
      .mockResolvedValueOnce(json({ message: "Validation error", status: 400, cause: [{ type: "warning", code: "shipping.lost_me1_by_user", message: "User has not mode me1" }] }, 400));

    const result = await validateMercadoLibreItemDraft(draft([{ id: "MANUFACTURER", value_name: "Genérica" }, { id: "MODEL", value_name: "Flores" }]), request);

    expect(result).toEqual({ ok: true, errors: [], warnings: [] });
    const [url, init] = request.mock.calls[2];
    expect(url).toBe("https://api.mercadolibre.com/items/validate");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ family_name: "Bitácora-Agenda William Morris", category_id: "MCO441243" });
    expect(body).not.toHaveProperty("title");
    expect(request).not.toHaveBeenCalledWith("https://api.mercadolibre.com/items", expect.anything());
  });

  it("names the empty required fields before asking Mercado Libre", async () => {
    const request = vi.fn().mockResolvedValueOnce(category()).mockResolvedValueOnce(attributes());

    const result = await validateMercadoLibreItemDraft(draft([]), request);

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({ step: "ficha", field: "MANUFACTURER" });
    expect(result.errors[0].message).toContain("MANUFACTURER");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("maps a Mercado Libre rejection to its field", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce(category())
      .mockResolvedValueOnce(attributes())
      .mockResolvedValueOnce(json({ message: "Validation error", status: 400, cause: [{ type: "error", code: "item.attribute.missing_conditional_required", references: ["item.attributes"], message: "The attributes [GTIN] are required for category [MCO441243]." }] }, 400));

    const result = await validateMercadoLibreItemDraft(draft([{ id: "MANUFACTURER", value_name: "Norma" }, { id: "MODEL", value_name: "7 materias" }]), request);

    expect(result.ok).toBe(false);
    expect(result.errors[0]).toMatchObject({ field: "GTIN", step: "ficha" });
  });
});
