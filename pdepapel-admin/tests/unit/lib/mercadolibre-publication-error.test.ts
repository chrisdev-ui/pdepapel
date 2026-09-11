import { describe, expect, it } from "vitest";

import { mapMercadoLibreItemError } from "@/lib/mercadolibre/publication-error";

const bad = (cause: Record<string, unknown>[], message = "Validation error") => ({
  message,
  error: "validation_error",
  status: 400,
  cause,
});

describe("mapMercadoLibreItemError", () => {
  it("sends a missing attribute to the ficha step with the attribute id, even when the message names the category", () => {
    const failure = mapMercadoLibreItemError(
      400,
      bad([
        {
          code: "item.attributes.missing_required",
          message: "Attribute BRAND is required for category MCO1234",
          references: ["item.attributes.BRAND"],
          type: "error",
        },
      ]),
    );
    expect(failure).toMatchObject({ kind: "review", step: "ficha", field: "BRAND", code: "item.attributes.missing_required" });
    expect(failure.message).toContain("«BRAND»");
  });

  it("distinguishes an invalid attribute value and reads the id from the message when there are no references", () => {
    const failure = mapMercadoLibreItemError(
      400,
      bad([{ code: "item.attributes.invalid_value", message: "Invalid value for attribute COLOR", references: [] }]),
    );
    expect(failure).toMatchObject({ kind: "review", step: "ficha", field: "COLOR" });
    expect(failure.message).toContain("no acepta el valor");
  });

  it("maps pictures, price, listing type, sale terms and family name to their steps", () => {
    expect(
      mapMercadoLibreItemError(400, bad([{ code: "item.pictures.invalid", message: "Invalid picture item.pictures.2", references: ["item.pictures.2"] }])),
    ).toMatchObject({ step: "categoria", field: "imageUrls", message: expect.stringContaining("foto 3") });
    expect(
      mapMercadoLibreItemError(400, bad([{ code: "item.price.invalid", message: "Price below minimum", references: ["item.price"] }])),
    ).toMatchObject({ step: "precio", field: "marketplacePrice" });
    expect(
      mapMercadoLibreItemError(400, bad([{ code: "item.listing_type_id.invalid", message: "listing_type_id not allowed", references: [] }])),
    ).toMatchObject({ step: "precio", field: "listingType" });
    expect(
      mapMercadoLibreItemError(400, bad([{ code: "item.sale_terms.missing_required", message: "sale_terms WARRANTY_TYPE is required", references: ["item.sale_terms.WARRANTY_TYPE"] }])),
    ).toMatchObject({ step: "precio", field: "WARRANTY_TYPE" });
    expect(
      mapMercadoLibreItemError(400, bad([{ code: "item.family_name.required", message: "family_name is required", references: [] }])),
    ).toMatchObject({ step: "producto", field: "familyName" });
    expect(
      mapMercadoLibreItemError(400, bad([{ code: "item.category_id.invalid", message: "category MCO999 is not a leaf", references: ["item.category_id"] }])),
    ).toMatchObject({ step: "categoria", field: "categoryId" });
  });

  it("classifies 5xx and 429 as transient and 401/403 as reauth, never as a draft problem", () => {
    expect(mapMercadoLibreItemError(503, { message: "Service unavailable" })).toMatchObject({ kind: "transient", step: null });
    expect(mapMercadoLibreItemError(429, { message: "Too many requests" })).toMatchObject({ kind: "transient" });
    expect(mapMercadoLibreItemError(401, { message: "invalid token" })).toMatchObject({ kind: "reauth" });
    expect(mapMercadoLibreItemError(403, null)).toMatchObject({ kind: "reauth" });
  });

  it("falls back to the top-level message and then to the raw text", () => {
    expect(mapMercadoLibreItemError(400, { message: "The attribute GTIN is invalid" })).toMatchObject({
      kind: "review",
      step: "ficha",
      field: "GTIN",
    });
    const raw = mapMercadoLibreItemError(400, { message: "Something odd", cause: [{ code: "item.unknown", message: "nope" }] });
    expect(raw).toMatchObject({ kind: "review", step: null, field: null, code: "item.unknown" });
    expect(raw.message).toContain("Something odd");
  });
});
