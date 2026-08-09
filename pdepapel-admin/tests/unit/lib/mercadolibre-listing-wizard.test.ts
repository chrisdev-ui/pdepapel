import { describe, expect, it } from "vitest";

import { getListingWizardStepError } from "@/lib/mercadolibre/listing-wizard";

const completeDraft = {
  productId: "product-1",
  marketplacePrice: "35000",
  categoryId: "MCO123",
  imageUrls: ["https://example.com/product.jpg"],
  attributes: "BRAND=P de Papel\nCOLOR=Rosado",
  categoryAttributes: [
    { id: "BRAND", required: true },
    { id: "COLOR", required: true },
  ],
} as const;

describe("getListingWizardStepError", () => {
  it("requires a product and a valid marketplace price first", () => {
    expect(
      getListingWizardStepError({
        ...completeDraft,
        step: 1,
        productId: "",
      }),
    ).toBe("Selecciona el producto que vas a publicar");

    expect(
      getListingWizardStepError({
        ...completeDraft,
        step: 1,
        marketplacePrice: "0",
      }),
    ).toBe("Escribe un precio de Mercado Libre mayor que cero");
  });

  it("requires a category and at least one selected product photo", () => {
    expect(
      getListingWizardStepError({
        ...completeDraft,
        step: 2,
        categoryId: "",
      }),
    ).toBe("Selecciona una categoría de Mercado Libre");

    expect(
      getListingWizardStepError({
        ...completeDraft,
        step: 2,
        imageUrls: [],
      }),
    ).toBe("Selecciona al menos una foto para publicar");
  });

  it("requires every technical attribute marked as mandatory", () => {
    expect(
      getListingWizardStepError({
        ...completeDraft,
        step: 3,
        attributes: "BRAND=P de Papel",
      }),
    ).toBe("Completa los campos obligatorios de la ficha técnica");

    expect(getListingWizardStepError({ ...completeDraft, step: 3 })).toBeNull();
  });
});
