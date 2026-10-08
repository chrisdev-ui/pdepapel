import { describe, expect, it } from "vitest";

import { mapMercadoLibreItemError, readMercadoLibreValidation } from "@/lib/mercadolibre/publication-error";

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

// Respuestas reales de `/items/validate` (2026-10-08, auditoría #18).
describe("Mercado Libre answers from a real account", () => {
  const gtinRequired = {
    department: "supply",
    type: "error",
    code: "item.attribute.missing_conditional_required",
    references: ["item.attributes"],
    message: "The attributes [GTIN] are required for category [MCO388307]. Check the attribute is present in the attributes list or in all variation's attributes_combination or attributes.",
  };
  const modelWarning = { type: "warning", code: "item.attribute.missing_catalog_required", references: ["item.attributes"], message: 'El campo "Modelo" es obligatorio y no está cargado.' };
  const shippingWarning = { department: "shipping", type: "warning", code: "shipping.lost_me1_by_user", references: ["user.shipping_preferences.modes"], message: "User has not mode me1" };

  it("points a registered brand's missing barcode to the GTIN field, not to the warning listed first", () => {
    const failure = mapMercadoLibreItemError(400, bad([modelWarning, gtinRequired]));
    expect(failure).toMatchObject({ kind: "review", step: "ficha", field: "GTIN", code: "item.attribute.missing_conditional_required" });
    expect(failure.message).toMatch(/código de barras/);
  });

  it("names the missing required attribute", () => {
    const failure = mapMercadoLibreItemError(
      400,
      bad([{ type: "error", code: "item.attributes.missing_required", references: ["item.attributes"], message: "The attributes [BRAND] are required for category MCO432665 and channel marketplace." }]),
    );
    expect(failure).toMatchObject({ step: "ficha", field: "BRAND" });
  });

  it("explains the title builder failure in plain Spanish without echoing internal ids", () => {
    const failure = mapMercadoLibreItemError(400, {
      message: "Error getting resource /decorations/build-title with params [caller.id:123, client.id:1]! [data:[message:attributes are required, error:bad_request, status:400], status:400, time:5]",
      error: "bad_request",
      status: 400,
      cause: [],
    });
    expect(failure).toMatchObject({ kind: "review", step: "ficha", field: null });
    expect(failure.message).toMatch(/título/);
    expect(failure.message).not.toMatch(/caller|client\.id|decorations/);
  });

  it("validation: warnings alone are not a rejection; the shipping mode notice is not shown", () => {
    const result = readMercadoLibreValidation(400, bad([shippingWarning, modelWarning]));
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatchObject({ field: "MODEL" });
    expect(result.warnings[0].message).toMatch(/Modelo/);
  });

  it("validation: 204 is valid; errors keep their field", () => {
    expect(readMercadoLibreValidation(204, null)).toEqual({ ok: true, errors: [], warnings: [] });
    const result = readMercadoLibreValidation(400, bad([modelWarning, gtinRequired]));
    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.field)).toEqual(["GTIN"]);
    expect(result.warnings.map((warning) => warning.field)).toEqual(["MODEL"]);
  });

  it("validation: a family name requirement points to the family field", () => {
    const result = readMercadoLibreValidation(400, bad([{ type: "error", code: "body.required_fields", references: ["body"], message: "The body does not contains some or none of the following properties [family_name]" }], "body.required_fields"));
    expect(result.errors[0]).toMatchObject({ step: "producto", field: "familyName" });
  });
});
