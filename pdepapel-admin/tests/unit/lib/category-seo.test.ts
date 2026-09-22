import { describe, expect, it } from "vitest";

import {
  CATEGORY_SEO_DESCRIPTION_MAX,
  CATEGORY_SEO_TITLE_MAX,
  clampSeoText,
} from "@/lib/category-seo";

/**
 * El recorte del título y la descripción SEO.
 *
 * No es cosmético: son columnas `VarChar(70)` y `VarChar(170)` sin truncado
 * automático, así que un texto de más no se guarda a medias, MySQL rechaza la
 * escritura entera. Y quien escribe el texto es un modelo, que se pasa de
 * largo con facilidad por mucho que el prompt le pida lo contrario.
 */
describe("clampSeoText", () => {
  it("deja en paz lo que ya cabe", () => {
    expect(clampSeoText("Agendas kawaii en Colombia", CATEGORY_SEO_TITLE_MAX)).toBe(
      "Agendas kawaii en Colombia",
    );
  });

  it("quita las comillas con las que contesta el modelo", () => {
    expect(clampSeoText('"Agendas kawaii"', CATEGORY_SEO_TITLE_MAX)).toBe("Agendas kawaii");
    expect(clampSeoText("«Agendas kawaii»", CATEGORY_SEO_TITLE_MAX)).toBe("Agendas kawaii");
  });

  it("aplana los saltos de línea y los espacios de sobra", () => {
    expect(clampSeoText("  Agendas\n\n  kawaii  ", CATEGORY_SEO_TITLE_MAX)).toBe("Agendas kawaii");
  });

  it("corta por palabra entera, no a la mitad", () => {
    const largo = "Agendas y cuadernos kawaii para estudiantes en Colombia con envíos a todo el país";
    const corto = clampSeoText(largo, CATEGORY_SEO_TITLE_MAX);
    expect(corto.length).toBeLessThanOrEqual(CATEGORY_SEO_TITLE_MAX);
    // Ninguna palabra queda partida: lo que sale es un prefijo por palabras.
    expect(largo.startsWith(corto)).toBe(true);
    expect(largo[corto.length]).toBe(" ");
  });

  it("no deja el texto terminado en coma ni en guion", () => {
    const texto = "Cuadernos, agendas, libretas y todo lo que necesitas para tomar apuntes, con envío";
    expect(clampSeoText(texto, 40)).not.toMatch(/[\s,;:.\-–—]$/);
  });

  it("una sola palabra larguísima se corta seca antes que devolver nada", () => {
    const palabra = "a".repeat(120);
    expect(clampSeoText(palabra, CATEGORY_SEO_TITLE_MAX)).toHaveLength(CATEGORY_SEO_TITLE_MAX);
  });

  it("respeta el tope de la descripción", () => {
    const texto = "Encuentra ".repeat(40);
    expect(clampSeoText(texto, CATEGORY_SEO_DESCRIPTION_MAX).length).toBeLessThanOrEqual(
      CATEGORY_SEO_DESCRIPTION_MAX,
    );
  });

  it("un texto vacío sigue vacío, no inventa nada", () => {
    expect(clampSeoText("   ", CATEGORY_SEO_TITLE_MAX)).toBe("");
  });
});
