import { describe, expect, it } from "vitest";

import {
  GOOGLE_CATEGORY_BY_CATEGORY_SLUG,
  GOOGLE_CATEGORY_BY_TYPE_SLUG,
  googleProductCategoryId,
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

/** Los IDs que usa el mapeo, copiados de la taxonomía de Google 2021-09-21 (en-US). */
const TAXONOMY: Record<number, string> = {
  16: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts",
  93: "Office Supplies > Book Accessories > Bookmarks",
  94: "Arts & Entertainment > Party & Celebration > Gift Giving > Gift Wrapping",
  100: "Luggage & Bags > Backpacks",
  167: "Apparel & Accessories > Clothing Accessories",
  171: "Apparel & Accessories > Clothing Accessories > Hair Accessories",
  175: "Apparel & Accessories > Handbag & Wallet Accessories > Keychains",
  333: "Office Supplies > Office Equipment > Calculators",
  476: "Health & Beauty > Personal Care > Cosmetics > Cosmetic Tools > Makeup Tools > Face Mirrors",
  487: "Health & Beauty > Personal Care > Hair Care > Hair Styling Tools > Combs & Brushes",
  516: "Health & Beauty > Health Care > First Aid > Hot & Cold Therapies",
  669: "Home & Garden > Kitchen & Dining > Food & Beverage Carriers > Lunch Boxes & Totes",
  922: "Office Supplies",
  923: "Office Supplies > Filing & Organization",
  927: "Office Supplies > Filing & Organization > Calendars, Organizers & Planners",
  932: "Office Supplies > General Office Supplies",
  934: "Office Supplies > General Office Supplies > Office Tape",
  935: "Office Supplies > Office Instruments > Clipboards",
  936: "Office Supplies > General Office Supplies > Paper Clips & Clamps",
  938: "Office Supplies > General Office Supplies > Erasers",
  939: "Office Supplies > Filing & Organization > Desk Organizers",
  943: "Office Supplies > Office Instruments > Pencil Sharpeners",
  956: "Office Supplies > General Office Supplies > Paper Products",
  958: "Office Supplies > General Office Supplies > Paper Products > Envelopes",
  961: "Office Supplies > General Office Supplies > Paper Products > Notebooks & Notepads",
  962: "Office Supplies > General Office Supplies > Paper Products > Printer & Copier Paper",
  971: "Office Supplies > Presentation Supplies > Dry-Erase Boards",
  977: "Office Supplies > Office Instruments > Writing & Drawing Instruments",
  979: "Office Supplies > Office Instruments > Writing & Drawing Instruments > Crayons",
  982: "Office Supplies > Office Instruments > Writing & Drawing Instruments > Pens & Pencils > Pens",
  1253: "Toys & Games > Toys",
  2014: "Office Supplies > Paper Handling",
  2021: "Hardware > Tools > Measuring Tools & Sensors > Rulers",
  2169: "Home & Garden > Kitchen & Dining > Tableware > Drinkware > Mugs",
  2503: "Health & Beauty > Personal Care > Cosmetics > Bath & Body > Bar Soap",
  2532: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Materials > Art & Craft Paper > Construction Paper",
  2591: "Office Supplies > General Office Supplies > Correction Fluids, Pens & Tapes",
  2658: "Office Supplies > General Office Supplies > Paper Products > Binder Paper",
  2668: "Apparel & Accessories > Handbags, Wallets & Cases > Wallets & Money Clips",
  2689: "Office Supplies > General Office Supplies > Paper Products > Sticky Notes",
  2915: "Health & Beauty > Personal Care",
  2951: "Home & Garden > Kitchen & Dining > Tableware > Drinkware > Tumblers",
  2967: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Materials > Art & Craft Paper > Origami Paper",
  2986: "Office Supplies > Office Instruments",
  3032: "Apparel & Accessories > Handbags, Wallets & Cases > Handbags",
  3062: "Office Supplies > Filing & Organization > Pen & Pencil Cases",
  3287: "Toys & Games > Toys > Building Toys > Interlocking Blocks",
  3328: "Electronics > Electronics Accessories > Cable Management",
  3691: "Health & Beauty > Personal Care > Cosmetics > Bath & Body > Hand Sanitizers & Wipes",
  3800: "Home & Garden > Kitchen & Dining > Food & Beverage Carriers > Thermoses",
  4032: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Tools > Craft Measuring & Marking Tools > Decorative Stamps",
  4054: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Materials > Embellishments & Trims > Decorative Stickers",
  4077: "Home & Garden > Linens & Bedding > Towels",
  4179: "Apparel & Accessories > Clothing Accessories > Pinback Buttons",
  4295: "Home & Garden > Decor > Piggy Banks & Money Jars",
  4303: "Office Supplies > Filing & Organization > Binding Supplies > Binders",
  4341: "Office Supplies > Office Instruments > Office Rubber Stamps",
  4358: "Home & Garden > Parasols & Rain Umbrellas",
  4472: "Office Supplies > Office Instruments > Writing & Drawing Instrument Accessories > Pencil Lead & Refills",
  4550: "Electronics > Communications > Telephony > Mobile Phone Accessories > Mobile Phone Charms & Straps",
  4636: "Home & Garden > Lighting > Lamps",
  4778: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Craft Kits > Drawing & Painting Kits",
  4986: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Craft Kits > Toy Craft Kits",
  5181: "Luggage & Bags",
  6068: "Office Supplies > Office Instruments > Writing & Drawing Instruments > Pens & Pencils > Pencils",
  6170: "Apparel & Accessories > Handbags, Wallets & Cases > Badge & Pass Holders",
  6829: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Craft Kits > Mosaic Kits",
  6884: "Office Supplies > Filing & Organization > Folders & Report Covers",
  503745: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Materials > Crafting Adhesives & Magnets > Craft & Office Glue",
  503758: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Craft Kits > Scrapbooking & Stamping Kits",
  504640: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Tools > Craft Cutting & Embossing Tools",
  504641: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Tools > Craft Cutting & Embossing Tools > Craft & Office Scissors",
  505379: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Materials > Embellishments & Trims",
  505392: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Tools > Craft Measuring & Marking Tools",
  505399: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Materials > Art & Craft Paper > Cardstock & Scrapbooking Paper",
  505400: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Materials > Art & Craft Paper > Drawing & Painting Paper",
  505410: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Materials > Embellishments & Trims > Sequins & Glitter",
  505417: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Materials > Craft Paint, Ink & Glaze > Art & Craft Paint",
  505419: "Arts & Entertainment > Hobbies & Creative Arts > Arts & Crafts > Art & Crafting Materials > Crafting Adhesives & Magnets > Decorative Tape",
  505818: "Toys & Games > Toys > Art & Drawing Toys > Play Dough & Putty",
  543543: "Media > Books > Print Books",
  543573: "Health & Beauty > Personal Care > Cosmetics > Skin Care > Lip Balms & Treatments > Lip Balms",
  543608: "Office Supplies > Office Instruments > Writing & Drawing Instruments > Markers & Highlighters > Markers",
  543609: "Office Supplies > Office Instruments > Writing & Drawing Instruments > Markers & Highlighters > Highlighters",
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

  it("solo los kits sin categoría propia caen al tipo; el resto tiene su ID", () => {
    const viaType = Object.entries(CATALOG).flatMap(([, slugs]) => slugs.filter((slug) => !(slug in GOOGLE_CATEGORY_BY_CATEGORY_SLUG)));
    expect(viaType.sort()).toEqual([
      "kits-de-lectura",
      "kits-de-oficina",
      "kits-escolares",
      "kits-kawaii",
      "kits-para-regalar-o-regalarse",
      "kits-sorpresa",
      "kits-universitarios",
    ]);
  });

  it("no hay entradas para categorías o tipos que la tienda no tiene", () => {
    const known = new Set(Object.values(CATALOG).flat());
    expect(Object.keys(GOOGLE_CATEGORY_BY_CATEGORY_SLUG).filter((slug) => !known.has(slug))).toEqual([]);
    expect(Object.keys(GOOGLE_CATEGORY_BY_TYPE_SLUG).filter((type) => !(type in CATALOG))).toEqual([]);
  });

  it("todos los IDs existen en la taxonomía de Google", () => {
    const used = [...Object.values(GOOGLE_CATEGORY_BY_CATEGORY_SLUG), ...Object.values(GOOGLE_CATEGORY_BY_TYPE_SLUG)];
    expect(used.filter((id) => !(id in TAXONOMY))).toEqual([]);
    expect(TAXONOMY[GOOGLE_CATEGORY_BY_CATEGORY_SLUG["boligrafos-lapiceros"]]).toBe(
      "Office Supplies > Office Instruments > Writing & Drawing Instruments > Pens & Pencils > Pens",
    );
  });

  it("prefiere la categoría, cae al tipo y sin nada devuelve null", () => {
    expect(googleProductCategoryId({ slug: "stickers", type: { slug: "journal-scrap" } })).toBe(4054);
    expect(googleProductCategoryId({ slug: "categoria-nueva", type: { slug: "kits" } })).toBe(922);
    expect(googleProductCategoryId({ slug: "categoria-nueva", type: { slug: "tipo-nuevo" } })).toBeNull();
    expect(googleProductCategoryId({ slug: "categoria-nueva", type: null })).toBeNull();
    expect(googleProductCategoryId(null)).toBeNull();
  });
});
