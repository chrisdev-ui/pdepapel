import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prismadb", () => ({
  default: { product: { findMany: vi.fn(), count: vi.fn(), findFirst: vi.fn() } },
}));
vi.mock("@/lib/env.mjs", () => ({ env: { GEMINI_API_KEY: "x" } }));

import {
  PRODUCT_MATCH_LIMIT,
  buildAvailabilityRows,
  buildListBody,
  buildOwnerRow,
  buildProductRows,
  buildRowTitles,
  previewProductTemplates,
} from "@/lib/whatsapp/bot-products";
import {
  PRODUCT_ROW_PREFIX,
  TALK_TO_OWNER_BUTTON_ID,
  readProductTarget,
} from "@/lib/whatsapp/bot-replies";
import {
  WHATSAPP_LIST_MAX_ROWS,
  WHATSAPP_LIST_ROW_DESCRIPTION_MAX_LENGTH,
  WHATSAPP_LIST_ROW_TITLE_MAX_LENGTH,
} from "@/lib/whatsapp/send";

/** Los peores grupos del catálogo real: los que colisionaban al cortar en 24. */
const REALES = {
  principito: [
    "Separadores de páginas El Principito Bufanda",
    "Separadores de páginas El Principito Verde",
    "Separadores de páginas El Principito Paloma",
    "Separadores de páginas El Principito Rosa",
    "Separadores de páginas El Principito Luna",
  ],
  carpetas: [
    "Carpeta plástica oficio verde pastel",
    "Carpeta plástica oficio rosada",
    "Carpeta plástica oficio azul pastel ",
    "Carpeta plástica oficio rosa pastel ",
    "Carpeta plástica oficio lila",
  ],
  lapiceros: [
    "Lapicero retráctil semigel 0.7mm pastel",
    "Caja de Lapiceros Offi-Esco Pocket Gel x4",
    "Lapiceros acrílicos gel pen x8",
  ],
};

describe("los títulos de las filas nunca se repiten", () => {
  it.each(Object.entries(REALES))(
    "«%s» del catálogo real da títulos distintos",
    (_grupo, nombres) => {
      const titulos = buildRowTitles(nombres);
      expect(new Set(titulos).size).toBe(nombres.length);
      titulos.forEach((t) =>
        expect(t.length).toBeLessThanOrEqual(WHATSAPP_LIST_ROW_TITLE_MAX_LENGTH),
      );
    },
  );

  it("conserva la palabra que distingue, que era justo lo que se perdía", () => {
    // Cortar a lo bruto dejaba los cinco en «Carpeta plástica oficio».
    const titulos = buildRowTitles(REALES.carpetas);
    expect(titulos).toEqual([
      "verde pastel",
      "rosada",
      "azul pastel",
      "rosa pastel",
      "lila",
    ]);
  });

  it("quita lo que todos repiten, no lo que los separa", () => {
    expect(buildRowTitles(REALES.principito)).toEqual([
      "Bufanda", "Verde", "Paloma", "Rosa", "Luna",
    ]);
  });

  it("con un solo nombre no quita nada", () => {
    expect(buildRowTitles(["Cuaderno Stitch"])).toEqual(["Cuaderno Stitch"]);
  });

  it("nombres sin nada en común se quedan como están", () => {
    const titulos = buildRowTitles(REALES.lapiceros);
    expect(new Set(titulos).size).toBe(3);
    expect(titulos[2]).toContain("Lapiceros acrílicos");
  });

  it("numera como último recurso si dos nombres son idénticos", () => {
    const titulos = buildRowTitles(["Cuaderno Stitch", "Cuaderno Stitch"]);
    expect(new Set(titulos).size).toBe(2);
    titulos.forEach((t) =>
      expect(t.length).toBeLessThanOrEqual(WHATSAPP_LIST_ROW_TITLE_MAX_LENGTH),
    );
  });

  it("un nombre larguísimo se corta pero sigue siendo único", () => {
    const titulos = buildRowTitles([
      "Cuaderno argollado cuadriculado grande 80h MAFALDA",
      "Cuaderno argollado cuadriculado Kraft Disney clásicos",
      "Cuaderno argollado cuadriculado 80 hojas",
    ]);
    expect(new Set(titulos).size).toBe(3);
    titulos.forEach((t) =>
      expect(t.length).toBeLessThanOrEqual(WHATSAPP_LIST_ROW_TITLE_MAX_LENGTH),
    );
  });
});

describe("las filas de producto", () => {
  const matches = REALES.carpetas.map((name) => ({ name, price: 8000 }));
  const ids = matches.map((_, i) => `id-${i}`);

  it("el id lleva el producto, con su prefijo propio", () => {
    const rows = buildProductRows(matches, ids);
    expect(rows[0].id).toBe(`${PRODUCT_ROW_PREFIX}id-0`);
    expect(readProductTarget(rows[0].id)).toBe("id-0");
  });

  it("la descripción lleva el nombre entero y el precio", () => {
    const rows = buildProductRows(matches, ids);
    expect(rows[0].description).toBe("Carpeta plástica oficio verde pastel — $8.000");
    rows.forEach((r) =>
      expect(r.description!.length).toBeLessThanOrEqual(
        WHATSAPP_LIST_ROW_DESCRIPTION_MAX_LENGTH,
      ),
    );
  });

  it("se salta las filas sin id en vez de mandar una rota", () => {
    expect(buildProductRows(matches, ["id-0", "", "id-2", "", ""])).toHaveLength(2);
  });

  it("cuando preguntan si queda, la descripción lo dice", () => {
    const rows = buildAvailabilityRows(
      [
        { name: "Cartuchera Capibara", inStock: true },
        { name: "Cartuchera Capibara grande", inStock: false },
      ],
      ["a", "b"],
    );
    expect(rows[0].description).toContain("disponible");
    expect(rows[1].description).toContain("agotado por ahora");
    // El número de unidades no sale nunca, tampoco aquí.
    expect(JSON.stringify(rows)).not.toMatch(/\d+ unidades/);
  });
});

describe("la fila de Paula", () => {
  it("usa el mismo id que su botón de siempre", () => {
    expect(buildOwnerRow().id).toBe(TALK_TO_OWNER_BUTTON_ID);
  });

  it("cabe junto al tope de productos sin pasarse de diez", () => {
    expect(PRODUCT_MATCH_LIMIT + 1).toBeLessThanOrEqual(WHATSAPP_LIST_MAX_ROWS);
  });

  it("no la confunde con una fila de producto", () => {
    expect(readProductTarget(buildOwnerRow().id)).toBeNull();
  });
});

describe("el texto que acompaña la lista", () => {
  it("con todos a la vista no habla de más", () => {
    const body = buildListBody(3, 3);
    expect(body).toContain("3");
    expect(body).not.toContain("más");
  });

  it("cuando hay más de los que caben, lo dice y pide precisar", () => {
    const body = buildListBody(PRODUCT_MATCH_LIMIT, 20);
    expect(body).toContain(String(20 - PRODUCT_MATCH_LIMIT));
    expect(body).toContain("preciso");
  });

  it("no repite las opciones: están dentro de la lista", () => {
    expect(buildListBody(3, 3)).not.toContain("•");
  });
});

describe("lo que Paula aprueba", () => {
  it("la vista previa dibuja la lista, no solo el texto", () => {
    const fila = previewProductTemplates().find((p) => p.text.includes("Ver opciones"));
    expect(fila).toBeDefined();
    expect(fila!.text).toContain("Hablar con Paula");
    // Se ve la forma: el botón, la sección y las filas con su descripción.
    expect(fila!.text).toContain("verde pastel");
    expect(fila!.text).toContain("Carpeta plástica oficio verde pastel — $12.000");
  });
});
