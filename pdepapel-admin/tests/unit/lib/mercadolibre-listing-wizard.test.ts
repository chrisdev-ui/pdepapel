import { describe, expect, it } from "vitest";

import {
  getInitialListingWizardStep,
  getListingWizardStepError,
  getListingWizardStepIssue,
  defaultListingFamilyName,
  getCategorySuggestionWarning,
  MERCADOLIBRE_MIN_PICTURE_SIDE,
  prefillListingAttributes,
  wizardStepFromPublicationStep,
} from "@/lib/mercadolibre/listing-wizard";

const completeDraft = {
  productId: "product-1",
  familyName: "Agenda kawaii",
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
        familyName: "",
      }),
    ).toBe("Escribe el nombre de familia que verá Mercado Libre");

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
        categoryId: "papeleria",
      }),
    ).toBe("Elige una categoría válida de las sugerencias de Mercado Libre");

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
    ).toBe("Completa «COLOR» en la ficha técnica");

    expect(getListingWizardStepError({ ...completeDraft, step: 3 })).toBeNull();
  });

  it("asks for a written reason before publishing below the acquisition cost", () => {
    expect(
      getListingWizardStepError({
        ...completeDraft,
        step: 4,
        marketplacePrice: "3500",
        acquisitionCost: 4000,
      }),
    ).toContain("por debajo del costo");
    expect(
      getListingWizardStepError({
        ...completeDraft,
        step: 4,
        marketplacePrice: "3500",
        acquisitionCost: 4000,
        belowCostReason: "abc",
      }),
    ).toContain("al menos 5 caracteres");
    expect(
      getListingWizardStepError({
        ...completeDraft,
        step: 4,
        marketplacePrice: "3500",
        acquisitionCost: 4000,
        belowCostReason: "liquidación de stock descontinuado",
      }),
    ).toBeNull();
    // Sin costo conocido, o con precio igual o superior, no se pide nada.
    expect(getListingWizardStepError({ ...completeDraft, step: 4, marketplacePrice: "3500" })).toBeNull();
    expect(
      getListingWizardStepError({ ...completeDraft, step: 4, marketplacePrice: "4000", acquisitionCost: 4000 }),
    ).toBeNull();
  });
});

describe("getListingWizardStepIssue", () => {
  it("names the field that blocks each step so the wizard can focus it", () => {
    expect(
      getListingWizardStepIssue({ ...completeDraft, step: 1, familyName: "  " }),
    ).toMatchObject({ step: 1, field: "familyName" });
    expect(
      getListingWizardStepIssue({ ...completeDraft, step: 2, imageUrls: [] }),
    ).toMatchObject({ step: 2, field: "imageUrls" });
    expect(
      getListingWizardStepIssue({
        ...completeDraft,
        step: 3,
        attributes: "",
        categoryAttributes: [
          { id: "BRAND", required: true },
          { id: "GTIN", required: true },
        ],
      }),
    ).toMatchObject({
      step: 3,
      field: "attribute:BRAND",
      message: expect.stringContaining("BRAND, GTIN"),
    });
    expect(
      getListingWizardStepIssue({
        ...completeDraft,
        step: 4,
        marketplacePrice: "3500",
        acquisitionCost: 4000,
      }),
    ).toMatchObject({ step: 4, field: "belowCostReason" });
  });

  it("lets a product flagged without identifier pass a mandatory GTIN", () => {
    const input = {
      ...completeDraft,
      step: 3 as const,
      attributes: "BRAND=P de Papel",
      categoryAttributes: [
        { id: "BRAND", required: true },
        { id: "GTIN", required: true },
      ],
    };
    expect(getListingWizardStepIssue(input)).toMatchObject({
      field: "attribute:GTIN",
    });
    expect(
      getListingWizardStepIssue({ ...input, productHasNoIdentifier: true }),
    ).toBeNull();
  });

  it("counts transportation cost inside the below-cost floor", () => {
    expect(
      getListingWizardStepIssue({
        ...completeDraft,
        step: 4,
        marketplacePrice: "4500",
        acquisitionCost: 4000,
        transportationCost: 1000,
      }),
    ).toMatchObject({ field: "belowCostReason" });
    expect(
      getListingWizardStepIssue({
        ...completeDraft,
        step: 4,
        marketplacePrice: "5000",
        acquisitionCost: 4000,
        transportationCost: 1000,
      }),
    ).toBeNull();
  });
});

describe("getInitialListingWizardStep", () => {
  const draft = {
    productId: "product-1",
    familyName: "Lapicero kawaii",
    marketplacePrice: "24000",
    categoryId: "MCO123",
    imageUrls: ["https://example.com/a.jpg"],
  };

  it("reopens a draft on the first incomplete step, never from scratch", () => {
    expect(getInitialListingWizardStep({ ...draft, familyName: "" })).toBe(1);
    expect(getInitialListingWizardStep({ ...draft, categoryId: "" })).toBe(2);
    expect(getInitialListingWizardStep({ ...draft, imageUrls: [] })).toBe(2);
    expect(getInitialListingWizardStep(draft)).toBe(3);
  });

  it("jumps to the step Mercado Libre rejected", () => {
    expect(
      getInitialListingWizardStep({ ...draft, publicationErrorStep: "precio" }),
    ).toBe(4);
    expect(
      getInitialListingWizardStep({ ...draft, publicationErrorStep: "ficha" }),
    ).toBe(3);
    expect(
      getInitialListingWizardStep({ ...draft, publicationErrorStep: "producto" }),
    ).toBe(1);
    expect(wizardStepFromPublicationStep(null)).toBeNull();
  });
});

describe("prefillListingAttributes", () => {
  const categoryAttributes = [
    { id: "BRAND", required: true },
    { id: "GTIN", required: true },
    { id: "MPN", required: false },
    {
      id: "COLOR",
      required: true,
      values: [{ id: "1", name: "Rosado" }, { id: "2", name: "Azul" }],
    },
    { id: "SIZE", required: false },
    {
      id: "EMPTY_GTIN_REASON",
      required: false,
      values: [
        { id: "a", name: "Producto artesanal" },
        { id: "b", name: "El producto no tiene código de barras" },
      ],
    },
  ];
  const product = {
    brand: "Owala",
    gtin: "7701234567890",
    mpn: "OW-1",
    colorName: "rosado",
    sizeName: "M",
    hasNoProductIdentifier: false,
  };

  it("fills only the empty fields from the product and respects closed lists", () => {
    const result = prefillListingAttributes("BRAND=Mi marca", categoryAttributes, product);
    expect(result.split("\n")).toEqual([
      "BRAND=Mi marca",
      "GTIN=7701234567890",
      "MPN=OW-1",
      "COLOR=Rosado",
      "SIZE=M",
    ]);
    // Un color fuera de la lista cerrada no se adivina.
    expect(
      prefillListingAttributes("", categoryAttributes, { ...product, colorName: "Lila" }),
    ).not.toContain("COLOR=");
  });

  it("skips the GTIN and picks the empty-GTIN reason for a product without identifier", () => {
    const result = prefillListingAttributes("", categoryAttributes, {
      ...product,
      hasNoProductIdentifier: true,
    });
    expect(result).not.toContain("GTIN=7701234567890");
    expect(result).toContain("EMPTY_GTIN_REASON=El producto no tiene código de barras");
  });

  it("returns the text untouched when there is nothing to add", () => {
    expect(prefillListingAttributes("BRAND=X", [{ id: "BRAND", required: true }], product)).toBe(
      "BRAND=X",
    );
  });
});

// Valores reales de MCO (auditoría #18): el motivo se elige por id, no por texto.
describe("prefill for a catalog without barcodes", () => {
  const emptyReason = {
    id: "EMPTY_GTIN_REASON",
    required: false,
    conditionalRequired: true,
    values: [
      { id: "17055158", name: "El producto es una pieza artesanal" },
      { id: "17055159", name: "El producto es un kit o un pack" },
      { id: "17055160", name: "El producto no tiene código registrado" },
      { id: "17055161", name: "Otra razón" },
    ],
  };
  const noId = { hasNoProductIdentifier: true };

  it("uses «No registrado» for a product without barcode and «kit o pack» for a kit", () => {
    expect(prefillListingAttributes("", [emptyReason], noId)).toBe("EMPTY_GTIN_REASON=El producto no tiene código registrado");
    expect(prefillListingAttributes("", [emptyReason], { ...noId, isKit: true })).toBe("EMPTY_GTIN_REASON=El producto es un kit o un pack");
  });

  it("never sends the empty reason when the product has a barcode", () => {
    expect(prefillListingAttributes("", [emptyReason], { gtin: "7701234567890", hasNoProductIdentifier: false })).toBe("");
  });

  it("never invents a brand: uses the product brand, else suggests «Genérica» only where the category accepts it", () => {
    const freeText = { id: "BRAND", required: true };
    const closedWithout = { id: "BRAND", required: true, values: [{ id: "1", name: "Owala" }] };
    const closedWith = { id: "BRAND", required: true, values: [{ id: "1", name: "Owala" }, { id: "2", name: "Genérica" }] };
    expect(prefillListingAttributes("", [freeText], { brand: "Norma" })).toBe("BRAND=Norma");
    expect(prefillListingAttributes("", [freeText], { brand: null })).toBe("BRAND=Genérica");
    expect(prefillListingAttributes("", [closedWithout], { brand: null })).toBe("");
    expect(prefillListingAttributes("", [closedWith], { brand: null })).toBe("BRAND=Genérica");
  });
});

describe("photos step", () => {
  const base = { ...completeDraft, step: 2 as const, imageUrls: ["a.jpg", "b.jpg"] };

  it("blocks a photo under Mercado Libre's minimum and says which one and why", () => {
    const issue = getListingWizardStepIssue({
      ...base,
      imageChecks: { "a.jpg": { width: 1200, height: 1600 }, "b.jpg": { width: 320, height: 400 } },
    });
    expect(issue).toMatchObject({ field: "imageUrls" });
    expect(issue?.message).toContain("La foto 2 mide 320 × 400 px");
    expect(issue?.message).toContain(`${MERCADOLIBRE_MIN_PICTURE_SIDE} × ${MERCADOLIBRE_MIN_PICTURE_SIDE}`);
  });

  it("waits for the size check and reports a photo that did not load", () => {
    expect(getListingWizardStepIssue({ ...base, imageChecks: { "a.jpg": "pending" } })?.message).toMatch(/revisando/i);
    expect(getListingWizardStepIssue({ ...base, imageChecks: { "a.jpg": { width: 900, height: 900 }, "b.jpg": "error" } })?.message).toContain("La foto 2 no se pudo cargar");
  });

  it("respects the category's maximum", () => {
    const issue = getListingWizardStepIssue({ ...base, imageUrls: ["1", "2", "3"], maxPictures: 2 });
    expect(issue?.message).toContain("máximo 2 fotos");
  });

  it("passes with valid photos", () => {
    expect(
      getListingWizardStepIssue({ ...base, imageChecks: { "a.jpg": { width: 500, height: 500 }, "b.jpg": { width: 1600, height: 1200 } } }),
    ).toBeNull();
  });
});

describe("ficha: barcode or its reason", () => {
  const attributes = [
    { id: "GTIN", required: false, conditionalRequired: true },
    { id: "EMPTY_GTIN_REASON", required: false, conditionalRequired: true, values: [{ id: "17055160", name: "El producto no tiene código registrado" }] },
  ];
  const draft = { ...completeDraft, step: 3 as const, categoryAttributes: attributes, productHasNoIdentifier: true };

  it("asks for the barcode or the reason when neither is filled", () => {
    expect(getListingWizardStepIssue({ ...draft, attributes: "" })).toMatchObject({ field: "attribute:EMPTY_GTIN_REASON" });
  });

  it("accepts either one", () => {
    expect(getListingWizardStepIssue({ ...draft, attributes: "GTIN=7701234567890" })).toBeNull();
    expect(getListingWizardStepIssue({ ...draft, attributes: "EMPTY_GTIN_REASON=El producto no tiene código registrado" })).toBeNull();
  });
});

describe("family name and category suggestions", () => {
  it("defaults to the group name for a variant", () => {
    expect(defaultListingFamilyName({ name: "Agendas Flores Azul", productGroupName: " Bitácora-Agenda William Morris " })).toBe("Bitácora-Agenda William Morris");
    expect(defaultListingFamilyName({ name: "Cuaderno Norma ", productGroupName: null })).toBe("Cuaderno Norma");
  });

  it("flags a kit suggested into a beauty or skin-care domain", () => {
    expect(getCategorySuggestionWarning({ domainId: "MCO-SKIN_CARE_KITS", domainName: "Kits de cuidado de la piel" }, { isKit: true })).toMatch(/no parece de papelería/);
    expect(getCategorySuggestionWarning({ domainId: "MCO-NOTEBOOKS_AND_WRITING_PADS", domainName: "Cuadernos" }, { isKit: true })).toBeNull();
    expect(getCategorySuggestionWarning({ domainId: "MCO-SKIN_CARE_KITS", domainName: "Kits de cuidado de la piel" }, { isKit: false })).toBeNull();
  });
});
