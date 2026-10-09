import { describe, expect, it } from "vitest";

import {
  buildVariantAttributes,
  describeGroupVariantState,
  getGroupVariantEconomics,
  getGroupVariantState,
} from "@/lib/mercadolibre/group-publication";

const categoryAttributes = [
  { id: "BRAND", required: true },
  { id: "MATERIAL", required: false },
  { id: "COLOR", required: true, values: [{ id: "1", name: "Rosa" }, { id: "2", name: "Celeste" }] },
  { id: "DESIGN", required: false },
  { id: "GTIN", required: true },
  {
    id: "EMPTY_GTIN_REASON",
    required: false,
    values: [{ id: "a", name: "El producto no tiene código de barras" }],
  },
];

describe("buildVariantAttributes", () => {
  const master = [
    { id: "BRAND", value_name: "Genérica" },
    { id: "MATERIAL", value_name: "Lona" },
    { id: "COLOR", value_id: "1", value_name: "Rosa" },
    { id: "GTIN", value_name: "7701234567890" },
    { id: "SELLER_SKU", value_name: "TOT-ROS" },
  ];

  it("copia lo común del borrador base y rellena color, diseño y código de cada variante", () => {
    expect(
      buildVariantAttributes(master, categoryAttributes, {
        brand: "Genérica",
        colorName: "Celeste",
        designName: "Gatito",
        hasNoProductIdentifier: true,
      }),
    ).toEqual([
      { id: "BRAND", value_name: "Genérica" },
      { id: "MATERIAL", value_name: "Lona" },
      { id: "COLOR", value_name: "Celeste" },
      { id: "DESIGN", value_name: "Gatito" },
      { id: "EMPTY_GTIN_REASON", value_name: "El producto no tiene código de barras" },
    ]);
  });

  it("un color fuera de las sugerencias se envía tal cual cuando Mercado Libre acepta texto libre", () => {
    const freeColor = categoryAttributes.map((attribute) => (attribute.id === "COLOR" ? { ...attribute, valueType: "string" } : attribute));
    const attributes = buildVariantAttributes(master, freeColor, { brand: "Genérica", colorName: "Azul pastel" });
    expect(attributes).toContainEqual({ id: "COLOR", value_name: "Azul pastel" });
  });

  it("nunca hereda el GTIN ni el color de otra variante", () => {
    const attributes = buildVariantAttributes(master, categoryAttributes, { brand: "Genérica", colorName: "Morado" });
    expect(attributes.find((attribute) => attribute.id === "GTIN")).toBeUndefined();
    expect(attributes.find((attribute) => attribute.id === "COLOR")).toBeUndefined();
    expect(attributes.find((attribute) => attribute.id === "SELLER_SKU")).toBeUndefined();
  });
});

describe("getGroupVariantState", () => {
  const base = { isArchived: false, stock: 3, imageCount: 2, listing: null, remoteItems: [] };

  it("lista para publicar con las unidades después del stock de seguridad", () => {
    expect(getGroupVariantState(base, 1)).toEqual({ kind: "ready", available: 2 });
  });

  it("una variante publicada muestra sus gemelas del mismo producto de usuario y no se vuelve a crear", () => {
    const state = getGroupVariantState(
      {
        ...base,
        listing: { externalItemId: "MCO1", externalUserProductId: "MCOU1" },
        remoteItems: [
          { id: "MCO1", status: "active", userProductId: "MCOU1" },
          { id: "MCO2", status: "active", userProductId: "MCOU1" },
          { id: "MCO3", status: "closed", userProductId: "MCOU9" },
        ],
      },
      0,
    );
    expect(state).toEqual({ kind: "listed", itemId: "MCO1", twins: ["MCO2"] });
    expect(describeGroupVariantState(state)).toBe(
      "Ya publicada: MCO1. Comparte stock y SKU con MCO2 (mismo producto de usuario).",
    );
  });

  it("sin el producto de usuario guardado, lo toma del ítem remoto", () => {
    expect(
      getGroupVariantState(
        {
          ...base,
          listing: { externalItemId: "MCO1" },
          remoteItems: [
            { id: "MCO1", status: "active", userProductId: "MCOU1" },
            { id: "MCO2", status: "paused", userProductId: "MCOU1" },
          ],
        },
        0,
      ),
    ).toEqual({ kind: "listed", itemId: "MCO1", twins: ["MCO2"] });
  });

  it("un ítem con el mismo SKU en Mercado Libre sin vincular bloquea la creación", () => {
    const state = getGroupVariantState({ ...base, remoteItems: [{ id: "MCO7", status: "active", userProductId: "MCOU7" }] }, 0);
    expect(state).toEqual({ kind: "remote", itemIds: ["MCO7"] });
    expect(describeGroupVariantState(state)).toContain("Importar existentes");
  });

  it("borrador existente, archivado, sin stock y sin fotos no se publican", () => {
    expect(getGroupVariantState({ ...base, listing: { externalItemId: null } }, 0).kind).toBe("draft");
    expect(getGroupVariantState({ ...base, isArchived: true }, 0).kind).toBe("archived");
    expect(getGroupVariantState({ ...base, stock: 1 }, 1).kind).toBe("no-stock");
    expect(getGroupVariantState({ ...base, imageCount: 0 }, 0).kind).toBe("no-photos");
  });

  it("si no se pudo consultar Mercado Libre, no deja crear: podría existir", () => {
    const state = getGroupVariantState({ ...base, remoteItems: null }, 0);
    expect(state.kind).toBe("unchecked");
    expect(describeGroupVariantState(state)).toContain("No se pudo revisar");
  });
});

describe("getGroupVariantEconomics", () => {
  const targets = { targetMarginPercent: 20, minNetPerUnit: 10_000 };

  it("calcula el neto de cada variante con su propio costo y avisa si no llega al objetivo", () => {
    const ok = getGroupVariantEconomics({
      price: 60_000,
      product: { acqPrice: 20_000, transportationCost: 0 },
      feeRate: 0.15,
      shippingCost: 9_000,
      pricingTargets: targets,
    });
    expect(ok.breakdown.net).toBe(60_000 - 9_000 - 9_000 - 900 - 20_000);
    expect(ok.warning).toBeNull();

    const short = getGroupVariantEconomics({
      price: 60_000,
      product: { acqPrice: 30_000, transportationCost: 0 },
      feeRate: 0.15,
      shippingCost: 9_000,
      pricingTargets: targets,
    });
    expect(short.warning).toContain("por debajo del objetivo");
    expect(short.suggestedPrice).toBeGreaterThan(60_000);
    const atSuggested = getGroupVariantEconomics({
      price: short.suggestedPrice!,
      product: { acqPrice: 30_000, transportationCost: 0 },
      feeRate: 0.15,
      shippingCost: 9_000,
      pricingTargets: targets,
    });
    expect(atSuggested.warning).toBeNull();
  });

  it("sin costo registrado no hay neto ni aviso", () => {
    const economics = getGroupVariantEconomics({ price: 50_000, product: {}, feeRate: 0.15, shippingCost: 9_000, pricingTargets: targets });
    expect(economics.breakdown.net).toBeNull();
    expect(economics.warning).toBeNull();
    expect(economics.suggestedPrice).toBeNull();
  });
});
