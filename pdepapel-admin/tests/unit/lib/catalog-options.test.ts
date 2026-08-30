import { describe, expect, it } from "vitest";

import {
  buildShippingProfileSuggestion,
  getCatalogMigrationFingerprint,
  inferCatalogAttributes,
  normalizeCatalogOptionKey,
  splitTaxonomyIcon,
} from "@/lib/catalog-options";
import { visualCatalogAttributesSchema } from "@/lib/catalog-migration";

describe("catalog options", () => {
  it("separates a visual icon from the canonical taxonomy name", () => {
    expect(splitTaxonomyIcon("✏️  Escritura y dibujo")).toEqual({
      icon: "✏️",
      name: "Escritura y dibujo",
    });
    expect(splitTaxonomyIcon("Cuadernos")).toEqual({
      icon: null,
      name: "Cuadernos",
    });
  });

  it("keeps legacy size codes as shipping profiles", () => {
    expect(
      buildShippingProfileSuggestion({ name: "Mediano pesado", value: "M-P" }),
    ).toEqual({
      code: "M-P",
      name: "Mediano pesado",
      dimensionCode: "M",
      weightCode: "P",
    });
  });

  it("extracts only explicit customer-facing measurements", () => {
    expect(
      inferCatalogAttributes("Cuaderno argollado A5 x 80 hojas con elástico"),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "formato", value: "A5" }),
        expect.objectContaining({ key: "cantidad", value: "80 hojas" }),
      ]),
    );
    expect(inferCatalogAttributes("Borrador kawaii M-P")).toEqual([]);
  });

  it("normalizes reusable option keys", () => {
    expect(normalizeCatalogOptionKey("Tipo de Punta")).toBe("tipo-de-punta");
  });

  it("changes the fingerprint when the product changes", () => {
    const first = getCatalogMigrationFingerprint({
      productId: "product-1",
      productUpdatedAt: "2026-08-27T10:00:00.000Z",
    });
    const second = getCatalogMigrationFingerprint({
      productId: "product-1",
      productUpdatedAt: "2026-08-28T10:00:00.000Z",
    });

    expect(first).not.toBe(second);
  });
});

describe("visual catalog attributes", () => {
  it("rejects duplicate canonical features before syncing a product", () => {
    const result = visualCatalogAttributesSchema.safeParse([
      {
        key: "formato",
        name: "Formato",
        value: "A5",
        evidence: "Visible en el empaque",
      },
      {
        key: "Formato",
        name: "FORMATO",
        value: "A6",
        evidence: "Confirmado manualmente",
      },
    ]);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]).toEqual(
      expect.objectContaining({
        path: [1, "name"],
        message: "La característica está repetida",
      }),
    );
  });
});
