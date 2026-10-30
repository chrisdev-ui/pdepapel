import { describe, expect, it } from "vitest";

import { groupBackfillByBrand, planBrandBackfill, type BackfillBrand, type BackfillProduct } from "@/lib/brand-backfill-plan";

const brands: BackfillBrand[] = [
  { id: "b-offi", name: "Offi-Esco", aliases: ["Offiesco"], parentBrandId: null },
  { id: "b-norma", name: "Norma", aliases: [], parentBrandId: null },
  { id: "b-kiut", name: "Kiut", aliases: ["Kiut by Norma"], parentBrandId: "b-norma" },
  { id: "b-x", name: "XY", aliases: [], parentBrandId: null },
];
const product = (over: Partial<BackfillProduct>): BackfillProduct => ({ id: "p", name: "", brand: null, brandId: null, productGroupId: null, ...over });

/**
 * Marca desde el nombre para Mercado Libre: solo marcas de la tienda, palabra
 * por palabra; nunca «Genérica» (eso lo decide la publicación por categoría).
 */
describe("plan de marcas para productos sin marca", () => {
  it("el texto viejo de marca gana si nombra una marca de la tienda", () => {
    const [row] = planBrandBackfill([product({ id: "1", name: "Cuaderno cosido", brand: "norma" })], brands);
    expect(row).toMatchObject({ status: "match", brandId: "b-norma", source: "campo-marca" });
  });

  it("nombre o alias, palabra por palabra; el alias más largo manda", () => {
    const rows = planBrandBackfill(
      [
        product({ id: "1", name: "Set de plumones Offi-esco x24" }),
        product({ id: "2", name: "Marcadores OFFIESCO" }),
        product({ id: "3", name: "Agenda Kiut by Norma 2027" }),
        product({ id: "4", name: "Normal cuaderno" }),
      ],
      brands,
    );
    expect(rows.map((r) => (r.status === "match" ? `${r.productId}:${r.brandId}:${r.source}` : `${r.productId}:${r.status}`))).toEqual([
      "1:b-offi:nombre",
      "2:b-offi:alias",
      "3:ambiguous",
      "4:none",
    ]);
  });

  it("frases de menos de 3 letras no cuentan y los que ya tienen marca no se tocan", () => {
    const rows = planBrandBackfill([product({ id: "1", name: "Mug XY gato" }), product({ id: "2", name: "Norma", brandId: "b-norma" })], brands);
    expect(rows).toEqual([{ productId: "1", productGroupId: null, status: "none" }]);
  });

  it("un grupo con variantes que apuntan a marcas distintas no se toca", () => {
    const rows = planBrandBackfill(
      [
        product({ id: "1", name: "Cuaderno Norma rojo", productGroupId: "g1" }),
        product({ id: "2", name: "Cuaderno Offi-Esco azul", productGroupId: "g1" }),
        product({ id: "3", name: "Lapicero Norma", productGroupId: "g2" }),
        product({ id: "4", name: "Lapicero Norma negro", productGroupId: "g2" }),
      ],
      brands,
    );
    const { byBrand, conflictingGroups } = groupBackfillByBrand(rows);
    expect(conflictingGroups).toEqual(["g1"]);
    expect(Object.fromEntries(byBrand)).toEqual({ "b-norma": ["3", "4"] });
  });
});
