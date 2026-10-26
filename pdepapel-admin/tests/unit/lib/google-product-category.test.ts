import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  GOOGLE_CATEGORY_BY_CATEGORY_SLUG,
  GOOGLE_CATEGORY_BY_TYPE_SLUG,
  googleProductCategoryId,
  SHALLOW_GOOGLE_CATEGORY_REASONS,
} from "@/lib/google-product-category";

/**
 * Tipos y categorías de la tienda (producción, 2026-10-23). Una categoría o un
 * tipo nuevo se agrega aquí y en el mapeo, o esta prueba falla: así ninguno
 * llega al feed sin categoría de Google.
 */
const CATALOG: Record<string, string[]> = {
  accesorios: ["accesorios-de-escritorio", "accesorios-personales", "alcancias", "bolsas-de-agua-termica", "bolsos-pequenos", "empaques-para-regalo", "lamparas", "llaveros", "monederos", "mugs", "pines", "porta-carnets", "protector-de-cargador", "sombrillas", "straps", "termos", "vasos"],
  "belleza-cuidado-personal": ["antibacterial", "brillos-balsamos", "cepillos", "espejos", "jabon-en-petalos", "monas-pinzas", "panitos", "toallas"],
  "bolsos-morrales": ["cartucheras", "loncheras", "maletas-morrales"],
  carpetas: ["archivadores", "carpetas", "planilleros", "sobres-plasticos"],
  "creatividad-juego": ["bloques-de-construccion", "crayones", "cuadros-de-piedras", "hojas-de-origami", "juegos-de-sticker-room", "libros-de-colorear", "pintar-con-numeros", "pinturas", "plastilina", "squishy"],
  cuadernos: ["argollados", "cosidos", "libretas", "multimaterias", "sketchbook-bitacora"],
  escritura: ["boligrafos-lapiceros", "marcadores", "micropuntas", "plumigrafos", "plumones", "rapidografos", "resaltadores"],
  "journal-scrap": ["blocks-de-hojas-decorativas", "cenefas-decorativas", "cuadernos-de-lettering", "escarcha", "sellos-decorativos", "set-de-journalscrap", "stickers", "troqueles", "washi-tape"],
  kits: ["kits-de-journal-scrap", "kits-de-lectura", "kits-de-oficina", "kits-escolares", "kits-kawaii", "kits-para-regalar-o-regalarse", "kits-sorpresa", "kits-universitarios"],
  "lapices-colores": ["colores", "lapices", "minas", "portaminas"],
  lectura: ["banderitas-adhesivas", "cintas-resaltadoras", "sellos-de-lectura", "separadores-de-paginas"],
  oficina: ["blocks-de-papel", "cartulinas", "herramientas-de-oficina", "papeles", "resmas", "sobres"],
  "planeacion-organizacion": ["agendas", "calculadoras", "calendarios", "diario-devocional", "folder", "hojas-de-repuesto", "organizadores", "planeadores", "set-de-notas-planner-sticky-notes", "tableros-borrables"],
  utiles: ["bisturies", "borradores", "cinta", "clips", "correctores", "guillotinas", "juegos-geometricos", "notas-adhesivas", "pegante", "reglas", "sacapuntas", "sellos-escolares", "tijeras"],
};

/**
 * La taxonomía oficial de Google, versión 2021-09-21 (en-US; la es-ES tiene los
 * mismos IDs): https://www.google.com/basepages/producttype/taxonomy-with-ids.en-US.txt
 */
const TAXONOMY = new Map(
  readFileSync(path.resolve(__dirname, "../../fixtures/google-product-taxonomy-2021-09-21.en-US.txt"), "utf8")
    .split("\n")
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => {
      const [id, ...rest] = line.split(" - ");
      return [Number(id), rest.join(" - ")] as const;
    }),
);
const depth = (id: number) => TAXONOMY.get(id)!.split(" > ").length;
const hasChildren = (id: number) => {
  const prefix = `${TAXONOMY.get(id)} > `;
  return Array.from(TAXONOMY.values()).some((other) => other.startsWith(prefix));
};

describe("categoría de Google para los feeds", () => {
  it("cada tipo de la tienda tiene un ID de respaldo", () => {
    const missing = Object.keys(CATALOG).filter((type) => !(type in GOOGLE_CATEGORY_BY_TYPE_SLUG));
    expect(missing).toEqual([]);
  });

  it("cada categoría de la tienda sale con un ID, propio o de su tipo", () => {
    const missing = Object.entries(CATALOG).flatMap(([type, slugs]) =>
      slugs.filter((slug) => googleProductCategoryId({ slug, type: { slug: type } }) === null).map((slug) => `${type} > ${slug}`),
    );
    expect(missing).toEqual([]);
  });

  it("ninguna categoría de la tienda cae al tipo: todas tienen su ID", () => {
    const viaType = Object.entries(CATALOG).flatMap(([, slugs]) => slugs.filter((slug) => !(slug in GOOGLE_CATEGORY_BY_CATEGORY_SLUG)));
    expect(viaType).toEqual([]);
  });

  it("no hay entradas para categorías o tipos que la tienda no tiene", () => {
    const known = new Set(Object.values(CATALOG).flat());
    expect(Object.keys(GOOGLE_CATEGORY_BY_CATEGORY_SLUG).filter((slug) => !known.has(slug))).toEqual([]);
    expect(Object.keys(GOOGLE_CATEGORY_BY_TYPE_SLUG).filter((type) => !(type in CATALOG))).toEqual([]);
  });

  it("todos los IDs existen en la taxonomía de Google", () => {
    const used = [...Object.values(GOOGLE_CATEGORY_BY_CATEGORY_SLUG), ...Object.values(GOOGLE_CATEGORY_BY_TYPE_SLUG)];
    expect(used.filter((id) => !TAXONOMY.has(id))).toEqual([]);
    expect(TAXONOMY.get(GOOGLE_CATEGORY_BY_CATEGORY_SLUG["boligrafos-lapiceros"])).toBe(
      "Office Supplies > Office Instruments > Writing & Drawing Instruments > Pens & Pencils > Pens",
    );
    expect(TAXONOMY.get(GOOGLE_CATEGORY_BY_CATEGORY_SLUG.guillotinas)).toBe(
      "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Tools > Craft Cutting & Embossing Tools > Craft Cutters & Embossers",
    );
  });

  it("Pinterest (Warning 126): ninguna categoría queda en 1–2 niveles si hay un nodo más profundo, salvo las justificadas", () => {
    const shallow = Object.entries(GOOGLE_CATEGORY_BY_CATEGORY_SLUG)
      .filter(([, id]) => depth(id) < 3 && hasChildren(id) && !(id in SHALLOW_GOOGLE_CATEGORY_REASONS))
      .map(([slug, id]) => `${slug} → ${id} ${TAXONOMY.get(id)}`);
    expect(shallow).toEqual([]);
  });

  it("la lista de excepciones solo trae IDs en uso, de verdad cortos y con ramas debajo", () => {
    const used = new Set(Object.values(GOOGLE_CATEGORY_BY_CATEGORY_SLUG));
    for (const [id, reason] of Object.entries(SHALLOW_GOOGLE_CATEGORY_REASONS)) {
      expect(used.has(Number(id)), `${id} no se usa`).toBe(true);
      expect(depth(Number(id)), `${id} ya tiene 3 niveles`).toBeLessThan(3);
      expect(hasChildren(Number(id)), `${id} es una hoja: no necesita excepción`).toBe(true);
      expect(reason.length).toBeGreaterThan(20);
    }
  });

  it("prefiere la categoría, cae al tipo y sin nada devuelve null", () => {
    expect(googleProductCategoryId({ slug: "stickers", type: { slug: "journal-scrap" } })).toBe(4054);
    expect(googleProductCategoryId({ slug: "categoria-nueva", type: { slug: "kits" } })).toBe(922);
    expect(googleProductCategoryId({ slug: "kits-kawaii", type: { slug: "kits" } })).toBe(922);
    expect(googleProductCategoryId({ slug: "categoria-nueva", type: { slug: "tipo-nuevo" } })).toBeNull();
    expect(googleProductCategoryId({ slug: "categoria-nueva", type: null })).toBeNull();
    expect(googleProductCategoryId(null)).toBeNull();
  });
});
