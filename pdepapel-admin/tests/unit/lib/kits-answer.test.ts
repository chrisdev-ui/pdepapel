import { describe, expect, it } from "vitest";

import { parseAnswer } from "@/lib/copiloto/answer-blocks";
import { composeKitsAnswer, fallbackCopy, type KitData, type KitsAnswerData } from "@/lib/copiloto/skills/kits-answer";

/** Valores de prueba con la forma real de `kitsParaRotar`. */
const kit = (overrides: Partial<KitData> = {}): KitData => ({
  nombreSugerido: "Kit Grados con Libreta lenta Prueba",
  ocasion: "grados",
  n: 1,
  piezas: [
    { nombre: "Libreta lenta Prueba", rol: "lento", categoria: "Libretas", precioEfectivo: 9000, precioDeLista: 9000, oferta: null },
    { nombre: "Lápiz Prueba", rol: "se vende", categoria: "Lápices", precioEfectivo: 4000, precioDeLista: 5000, oferta: "20 %" },
    { nombre: "Borrador Prueba", rol: "se vende", categoria: "Borradores", precioEfectivo: 3000, precioDeLista: 3000, oferta: null, comparteStockCon: ["Kit Útiles con Carpeta"] },
  ],
  kitsArmables: 4,
  sumaPreciosEfectivos: 16000,
  precioSugerido: 13900,
  ahorroPct: 13.1,
  margenPct: 61.9,
  margenBajo: false,
  sinCostoDe: [],
  estado: "listo",
  descuentoObjetivoPct: 12,
  señales: ["Libreta lenta Prueba: 120 días sin venderse, $24.000 quietos a costo", "Lápiz Prueba: en alza (6 en 30 días contra 1 antes)"],
  ...overrides,
});

const datos = (overrides: Partial<KitsAnswerData> = {}): KitsAnswerData => ({
  criterios: { diasSinVenta: 90, lineasSinFamilia: [] },
  totalLentos: 3,
  plataQuietaACostoTotal: 50000,
  lentosSinCosto: 1,
  lentos: [
    { nombre: "Libreta lenta Prueba", disponible: 8, plataQuietaACosto: 24000, ultimaVenta: "hace 120 días" },
    { nombre: "Carpeta lenta Prueba", disponible: 6, plataQuietaACosto: 18000, ultimaVenta: "hace 100 días" },
    { nombre: "Agenda sin costo Prueba", disponible: 6, plataQuietaACosto: null, ultimaVenta: "más de un año" },
  ],
  nuevosSinDatosDeVenta: { cantidad: 2 },
  quietosDeBajoValor: { cantidad: 1, nombres: ["Sobre lento Prueba"] },
  kits: [kit()],
  pocoAtractivos: [],
  sinKit: [],
  ...overrides,
});

/** Lo que el modelo manda a `textosDeKits`. */
const TEXTS = {
  kits: [{ n: 1, nombreCorto: "Kit de grados", loQueAmaras: ["Una libreta para tus ideas", "Útiles para el día a día"], idealPara: "regalar a quien se gradúa" }],
};
const textsFor = (...kits: { n: number; nombreCorto: string; loQueAmaras: string[]; idealPara: string | null }[]) => ({ kits });

describe("respuesta de kits armada por el código", () => {
  it("resumen, los 5 con más plata quieta, el kit en su bloque y las notas", () => {
    expect(composeKitsAnswer(datos(), TEXTS)).toBe(
      [
        "## Resumen",
        "",
        "Hay **3 productos quietos** (sin ventas en 90 días) con **$50.000** quietos a costo. 1 no tiene costo registrado y no suma a esa plata. No cuento 2 productos nuevos: entraron hace menos de 90 días y todavía no se sabe si se venden.",
        "",
        "## Los 3 con más plata quieta",
        "",
        "1. Libreta lenta Prueba · 8 und · sin ventas hace 120 días · $24.000 a costo",
        "2. Carpeta lenta Prueba · 6 und · sin ventas hace 100 días · $18.000 a costo",
        "3. Agenda sin costo Prueba · 6 und · sin ventas en más de un año · sin costo registrado",
        "",
        "## 1 kit sugerido",
        "",
        "### 🎓 Kit de grados",
        "",
        "**$13.900** · por separado $16.000 · ahorro 13,1 % · margen 61,9 % · alcanza para 4 kits",
        "",
        "- Libreta lenta Prueba · $9.000 [[tag:quieto]]",
        "- Lápiz Prueba · $4.000 (oferta «20 %», antes $5.000) [[tag:se vende]]",
        "- Borrador Prueba · $3.000 [[tag:se vende]]",
        "  - comparte stock con «Kit Útiles con Carpeta»",
        "",
        ":::detalle Por qué estos productos",
        "- Libreta lenta Prueba: 120 días sin venderse, $24.000 quietos a costo",
        "- Lápiz Prueba: en alza (6 en 30 días contra 1 antes)",
        ":::",
        "",
        ":::copiar Texto para la ficha",
        "✨ Lo que amarás",
        "- Una libreta para tus ideas",
        "- Útiles para el día a día",
        "📦 Incluye",
        "- Libreta lenta Prueba",
        "- Lápiz Prueba",
        "- Borrador Prueba",
        "🎁 Ideal para regalar a quien se gradúa.",
        ":::",
        "",
        "## Notas",
        "",
        "- 1 quieto de bajo valor no entra como pieza principal de un kit (Sobre lento Prueba): mejor en promo o en un combo de caja.",
        "- Son borradores: créalos en Productos › Kit si te sirven.",
      ].join("\n"),
    );
  });

  it("sin jerga ni nombres de herramientas, y un texto del modelo con montos o «:::» no se usa", () => {
    const text = composeKitsAnswer(datos(), TEXTS);
    expect(text).not.toMatch(/kitsParaRotar|textosDeKits|suma de precios efectivos|precio efectivo|\(lento\)|\(se vende\)/);
    const bad = composeKitsAnswer(datos(), textsFor({ n: 1, nombreCorto: "Kit $9.900", loQueAmaras: ["Ahorra 13 %", "Algo"], idealPara: "ver :::detalle" }));
    expect(bad).not.toMatch(/\$9\.900|Ahorra 13 %|ver :::/);
    expect(bad).toContain(":::copiar Texto para la ficha (base)");
    // La lista de piezas aparece una vez fuera del texto para la ficha.
    const outsideCopy = text.replace(/:::copiar[\s\S]*?:::/g, "");
    expect(outsideCopy.match(/Lápiz Prueba · \$4\.000/g)).toHaveLength(1);
  });

  it("cada número sale de la herramienta, con su mismo formato", () => {
    const text = composeKitsAnswer(datos(), TEXTS);
    const amounts = Array.from(text.matchAll(/\$\d{1,3}(?:\.\d{3})*/g), (match) => match[0]);
    expect(new Set(amounts)).toEqual(new Set(["$50.000", "$24.000", "$18.000", "$13.900", "$16.000", "$9.000", "$4.000", "$5.000", "$3.000"]));
  });

  it("dos kits que comparten pieza se nombran igual en su título y en «comparte stock con»; la fecha de temporada se lee", () => {
    const other = kit({ nombreSugerido: "Kit Útiles con Carpeta", ocasion: "útiles escolares", n: 2, señales: ["temporada: Grados el 2026-11-25"] });
    const text = composeKitsAnswer(datos({ kits: [kit(), other] }), textsFor(TEXTS.kits[0], { n: 2, nombreCorto: "Kit Carpetas Kawaii", loQueAmaras: ["Uno", "Dos"], idealPara: null }));
    expect(text).toContain("### ✏️ Kit Carpetas Kawaii");
    expect(text).toContain("  - comparte stock con «Kit Carpetas Kawaii»");
    expect(text).toContain("- temporada: Grados (25 de noviembre)");
  });

  it("margen por debajo del criterio del panel: etiqueta «margen bajo» junto al margen", () => {
    expect(composeKitsAnswer(datos({ kits: [kit({ margenPct: 30, margenBajo: true })] }), TEXTS)).toContain("margen 30 % [[tag:margen bajo]]");
    const withGoal = datos({ criterios: { diasSinVenta: 90, margenCriterioPanelPct: 35 }, kits: [kit({ margenPct: 30, margenBajo: true })] });
    expect(composeKitsAnswer(withGoal, TEXTS)).toContain("margen 30 % [[tag:margen bajo (meta 35 %)]]");
  });

  it("sin costo: sin margen, la línea clave empieza por el precio por separado y lo dice", () => {
    const text = composeKitsAnswer(datos({ kits: [kit({ precioSugerido: null, margenPct: null, margenBajo: null, ahorroPct: null, sinCostoDe: ["Borrador Prueba"], estado: "sin costo" })] }), TEXTS);
    expect(text).toContain("**por separado $16.000** · alcanza para 4 kits");
    expect(text).toContain("Sin costo de Borrador Prueba: no se calcula margen ni precio mínimo.");
    expect(text).not.toMatch(/margen \d/);
  });

  it("sin textos del modelo: queda el nombre de la herramienta y un texto base con sus categorías, su ocasión y sus piezas", () => {
    const text = composeKitsAnswer(datos(), null);
    expect(text).toContain("### 🎓 Kit Grados con Libreta lenta Prueba");
    expect(text).toContain(
      [
        ":::copiar Texto para la ficha (base)",
        "✨ Lo que amarás",
        "- Libretas, lápices y borradores en un solo kit",
        "- Un detalle para celebrar un logro importante",
        "📦 Incluye",
        "- Libreta lenta Prueba",
        "- Lápiz Prueba",
        "- Borrador Prueba",
        "🎁 Ideal para regalar en grados.",
        ":::",
      ].join("\n"),
    );
  });

  it("texto base: frases según la ocasión, y sin ocasión no inventa para qué es", () => {
    expect(fallbackCopy(kit({ ocasion: "Útiles escolares" }))).toContain("- Listo para el colegio, las tareas y los apuntes\n");
    expect(fallbackCopy(kit({ ocasion: "Útiles escolares" }))).toContain("🎁 Ideal para el regreso a clases y el día a día del colegio.");
    expect(fallbackCopy(kit({ ocasion: "Navidad (en 30 días)" }))).toContain("🎁 Ideal para regalar en Navidad.");
    expect(fallbackCopy(kit({ ocasion: "Día del amigo secreto" }))).toContain("🎁 Ideal para día del amigo secreto.");
    const plain = fallbackCopy(kit({ ocasion: null }));
    expect(plain).toContain("- Piezas que combinan entre sí, elegidas para usarse juntas");
    expect(plain).not.toContain("🎁");
    expect(fallbackCopy(kit({ piezas: [{ nombre: "A", rol: "lento", precioEfectivo: 1 }] }))).toContain("- Todo lo que necesitas en un solo kit");
  });

  it("cada campo del modelo se valida solo: un nombre largo cae al de la herramienta, sin perder sus frases; sin «para qué» se usa el de la ocasión", () => {
    const text = composeKitsAnswer(datos(), textsFor({ n: 1, nombreCorto: "Kit de grados con libreta lenta prueba y lápiz", loQueAmaras: ["Uno", "Dos"], idealPara: null }));
    expect(text).toContain("### 🎓 Kit Grados con Libreta lenta Prueba");
    expect(text).toContain(":::copiar Texto para la ficha\n✨ Lo que amarás\n- Uno\n- Dos\n📦 Incluye");
    expect(text).toContain("🎁 Ideal para regalar en grados.");
    const oneBullet = composeKitsAnswer(datos(), textsFor({ n: 1, nombreCorto: "Kit de grados", loQueAmaras: ["Solo una"], idealPara: null }));
    expect(oneBullet).toContain("### 🎓 Kit de grados");
    expect(oneBullet).toContain(":::copiar Texto para la ficha (base)");
  });

  it("sin productos quietos: solo el resumen", () => {
    expect(composeKitsAnswer(datos({ totalLentos: 0, lentos: [], kits: [], nuevosSinDatosDeVenta: { cantidad: 0 } }), null)).toBe("## Resumen\n\nNo hay productos con disponible y sin ventas en 90 días.");
  });

  it("quietos sin kits que convengan: lo dice y explica en las notas", () => {
    const text = composeKitsAnswer(datos({ kits: [], sinKit: [{ nombre: "Carpeta lenta Prueba", motivo: "no hay piezas que se vendan en su familia" }] }), null);
    expect(text).toContain("## Kits\n\nNo encontré kits que convengan con estos productos.");
    expect(text).toContain("- Sin kit: Carpeta lenta Prueba — no hay piezas que se vendan en su familia.");
  });

  it("el chat lo pinta en secciones, con la lista de piezas anidada y los bloques plegables", () => {
    const blocks = parseAnswer(composeKitsAnswer(datos(), TEXTS));
    expect(blocks.filter((block) => block.type === "heading").map((block) => (block as { text: string }).text)).toEqual([
      "Resumen",
      "Los 3 con más plata quieta",
      "1 kit sugerido",
      "🎓 Kit de grados",
      "Notas",
    ]);
    expect(blocks.filter((block) => block.type === "details" || block.type === "copy").map((block) => block.type)).toEqual(["details", "copy"]);
  });

  describe("réplica de la respuesta de producción del 2026-10-16", () => {
    // La respuesta real: el modelo no mandó textos para ningún kit y los nombres de la herramienta eran el producto completo.
    const piezas = (lenta: string, categoria: string, otra: string) => [
      { nombre: lenta, rol: "lento", categoria, precioEfectivo: 20000 },
      { nombre: otra, rol: "se vende", categoria: "Cuadernos", precioEfectivo: 6000 },
      { nombre: `Borrador ${otra}`, rol: "se vende", categoria: "Borradores", precioEfectivo: 3000 },
    ];
    const production = datos({
      criterios: { diasSinVenta: 90, lineasSinFamilia: [], margenCriterioPanelPct: 35, precioMinimoPiezaLenta: 5000 },
      lentos: [
        { nombre: "Set de plumones Prueba doble punta pincel y fina 24 colores", disponible: 8, plataQuietaACosto: 60000, ultimaVenta: "hace 120 días" },
        { nombre: "Sobre de manila oficio Prueba x unidad", disponible: 200, plataQuietaACosto: 30000, ultimaVenta: "hace 200 días" },
      ],
      quietosDeBajoValor: { cantidad: 1, nombres: ["Sobre de manila oficio Prueba x unidad"], productos: [{ nombre: "Sobre de manila oficio Prueba x unidad", precioEfectivo: 300, motivo: "precio unitario bajo" }] },
      kits: [
        kit({ nombreSugerido: "Kit Plumones Primavera", ocasion: "Útiles escolares", n: 1, piezas: piezas("Set de plumones Prueba doble punta pincel y fina 24 colores", "Plumones", "Cuaderno Prueba"), margenPct: 30, margenBajo: true }),
        kit({ nombreSugerido: "Kit Cartucheras Totto", ocasion: "Útiles escolares", n: 2, piezas: piezas("Cartuchera Prueba de tres compartimentos con cremallera", "Cartucheras", "Regla Prueba"), margenPct: 28, margenBajo: true }),
        kit({ nombreSugerido: "Kit Regalo Snoopy", ocasion: "Regalo", n: 3, piezas: piezas("Maleta conejito Prueba para niñas con ruedas y manija", "Maletas", "Libreta Prueba"), margenPct: 25, margenBajo: true }),
      ],
    });
    const text = composeKitsAnswer(production, null);
    const blocks = parseAnswer(text);
    const kitTitles = blocks.filter((block) => block.type === "heading" && block.level === 3).map((block) => (block as { text: string }).text.replace(/^\S+\s/, ""));
    const copies = blocks.filter((block): block is Extract<typeof block, { type: "copy" }> => block.type === "copy");

    it("cada kit trae su texto base, solo con su plantilla y sus propias piezas", () => {
      expect(copies).toHaveLength(3);
      expect(copies.every((copy) => copy.title === "Texto para la ficha (base)")).toBe(true);
      copies.forEach((copy, index) => {
        expect(copy.text.split("\n").every((line) => /^(✨|📦|🎁|- )/.test(line))).toBe(true);
        expect(copy.text).toContain(production.kits![index].piezas[0].nombre);
        production.kits!.filter((_, other) => other !== index).forEach((other) => expect(copy.text).not.toContain(other.piezas[0].nombre));
      });
      expect(text).not.toMatch(/no alcanza para armar tres kits/);
    });

    it("ni «:::» suelto ni marcadores en lo que se pinta", () => {
      const visible = JSON.stringify(blocks);
      expect(visible).not.toMatch(/\[\[KIT/i);
      expect(visible).not.toContain(":::");
    });

    it("nombres cortos (máximo 6 palabras) y distintos", () => {
      expect(kitTitles).toEqual(["Kit Plumones Primavera", "Kit Cartucheras Totto", "Kit Regalo Snoopy"]);
      expect(new Set(kitTitles).size).toBe(3);
      expect(kitTitles.every((title) => title.split(/\s+/).length <= 6)).toBe(true);
    });

    it("«margen bajo» dice la meta, y el sobre barato explica por qué no entra en kits", () => {
      expect(text.match(/\[\[tag:margen bajo \(meta 35 %\)\]\]/g)).toHaveLength(3);
      expect(text).toContain("2. Sobre de manila oficio Prueba x unidad · 200 und · sin ventas hace 200 días · $30.000 a costo [[tag:no va en kits]]");
      expect(text).toContain("- Sobre de manila oficio Prueba x unidad no entra en kits porque su precio por unidad es muy bajo ($300; una pieza quieta debe valer al menos $5.000). Mejor en promo o en un combo de caja.");
    });
  });

  it("dos kits con el mismo nombre del modelo, o que empiezan igual: el segundo toma el de la herramienta", () => {
    const other = kit({ nombreSugerido: "Kit Carpetas Kawaii", n: 2 });
    const same = composeKitsAnswer(datos({ kits: [kit(), other] }), textsFor(TEXTS.kits[0], { ...TEXTS.kits[0], n: 2 }));
    expect(same).toContain("### 🎓 Kit de grados");
    expect(same).toContain("### 🎓 Kit Carpetas Kawaii");
    const prefix = composeKitsAnswer(datos({ kits: [kit(), other] }), textsFor(TEXTS.kits[0], { ...TEXTS.kits[0], n: 2, nombreCorto: "Kit de grados escolares" }));
    expect(prefix).toContain("### 🎓 Kit Carpetas Kawaii");
  });

  it("un kit sin textos del modelo nunca toma los de otro: va el texto base con sus piezas", () => {
    const other = kit({ nombreSugerido: "Kit Carpetas Kawaii", n: 2, ocasion: null, piezas: [{ nombre: "Carpeta Prueba", rol: "lento", categoria: "Carpetas", precioEfectivo: 9000 }] });
    const text = composeKitsAnswer(datos({ kits: [kit(), other] }), TEXTS);
    const copies = parseAnswer(text).filter((block) => block.type === "copy") as { title: string; text: string }[];
    expect(copies.map((copy) => copy.title)).toEqual(["Texto para la ficha", "Texto para la ficha (base)"]);
    expect(copies[1].text).toBe("✨ Lo que amarás\n- Carpetas en un solo kit\n- Piezas que combinan entre sí, elegidas para usarse juntas\n📦 Incluye\n- Carpeta Prueba");
  });
});
