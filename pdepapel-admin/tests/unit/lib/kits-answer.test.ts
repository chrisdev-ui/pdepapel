import { describe, expect, it } from "vitest";

import { parseAnswer } from "@/lib/copiloto/answer-blocks";
import { composeKitsAnswer, readModelKits, type KitData, type KitsAnswerData } from "@/lib/copiloto/skills/kits-answer";

/** Valores de prueba con la forma real de `kitsParaRotar`. */
const kit = (overrides: Partial<KitData> = {}): KitData => ({
  nombreSugerido: "Kit Grados con Libreta lenta Prueba",
  ocasion: "grados",
  marcador: "[[KIT-1]]",
  piezas: [
    { nombre: "Libreta lenta Prueba", rol: "lento", precioEfectivo: 9000, precioDeLista: 9000, oferta: null },
    { nombre: "Lápiz Prueba", rol: "se vende", precioEfectivo: 4000, precioDeLista: 5000, oferta: "20 %" },
    { nombre: "Borrador Prueba", rol: "se vende", precioEfectivo: 3000, precioDeLista: 3000, oferta: null, comparteStockCon: ["Kit Útiles con Carpeta"] },
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

const MODEL = [
  "¡Claro! Según kitsParaRotar hay 3 lentos y la suma de precios efectivos es $16.000.",
  "[[KIT-1]] Kit de grados",
  "✨ Lo que amarás",
  "- Una libreta para tus ideas",
  "- Útiles para el día a día",
  "📦 Incluye: Libreta lenta Prueba, Lápiz Prueba y Borrador Prueba",
  "🎁 Ideal para regalar a quien se gradúa.",
  "Precio especial: $13.900",
].join("\n");

describe("respuesta de kits armada por el código", () => {
  it("resumen, los 5 con más plata quieta, el kit en su bloque y las notas", () => {
    expect(composeKitsAnswer(datos(), MODEL)).toBe(
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
        "📦 Incluye: Libreta lenta Prueba, Lápiz Prueba y Borrador Prueba",
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

  it("nada de lo que el modelo escribe fuera de su kit se muestra: ni nombres de herramientas, ni jerga, ni montos", () => {
    const text = composeKitsAnswer(datos(), MODEL);
    expect(text).not.toMatch(/kitsParaRotar|suma de precios efectivos|precio efectivo|\(lento\)|\(se vende\)|Precio especial|¡Claro!/);
    // La lista de piezas aparece una vez fuera del texto para la ficha.
    const outsideCopy = text.replace(/:::copiar[\s\S]*?:::/g, "");
    expect(outsideCopy.match(/Lápiz Prueba · \$4\.000/g)).toHaveLength(1);
  });

  it("cada número sale de la herramienta, con su mismo formato", () => {
    const text = composeKitsAnswer(datos(), MODEL);
    const amounts = Array.from(text.matchAll(/\$\d{1,3}(?:\.\d{3})*/g), (match) => match[0]);
    expect(new Set(amounts)).toEqual(new Set(["$50.000", "$24.000", "$18.000", "$13.900", "$16.000", "$9.000", "$4.000", "$5.000", "$3.000"]));
  });

  it("dos kits que comparten pieza se nombran igual en su título y en «comparte stock con»; la fecha de temporada se lee", () => {
    const other = kit({ nombreSugerido: "Kit Útiles con Carpeta", ocasion: "útiles escolares", marcador: "[[KIT-2]]", señales: ["temporada: Grados el 2026-11-25"] });
    const text = composeKitsAnswer(datos({ kits: [kit(), other] }), `${MODEL}\n[[KIT-2]] Kit de útiles\n📦 Incluye: Carpeta`);
    expect(text).toContain("### ✏️ Kit de útiles");
    expect(text).toContain("  - comparte stock con «Kit de útiles»");
    expect(text).toContain("- temporada: Grados (25 de noviembre)");
  });

  it("margen por debajo del criterio del panel: etiqueta «margen bajo» junto al margen", () => {
    const text = composeKitsAnswer(datos({ kits: [kit({ margenPct: 30, margenBajo: true })] }), MODEL);
    expect(text).toContain("margen 30 % [[tag:margen bajo]]");
  });

  it("sin costo: sin margen, la línea clave empieza por el precio por separado y lo dice", () => {
    const text = composeKitsAnswer(datos({ kits: [kit({ precioSugerido: null, margenPct: null, margenBajo: null, ahorroPct: null, sinCostoDe: ["Borrador Prueba"], estado: "sin costo" })] }), MODEL);
    expect(text).toContain("**por separado $16.000** · alcanza para 4 kits");
    expect(text).toContain("Sin costo de Borrador Prueba: no se calcula margen ni precio mínimo.");
    expect(text).not.toMatch(/margen \d/);
  });

  it("sin nombre corto ni texto del modelo: queda el nombre de la herramienta y no hay bloque de copiar", () => {
    const text = composeKitsAnswer(datos(), "");
    expect(text).toContain("### 🎓 Kit Grados con Libreta lenta Prueba");
    expect(text).not.toContain(":::copiar");
  });

  it("sin productos quietos: solo el resumen", () => {
    expect(composeKitsAnswer(datos({ totalLentos: 0, lentos: [], kits: [], nuevosSinDatosDeVenta: { cantidad: 0 } }), "")).toBe("## Resumen\n\nNo hay productos con disponible y sin ventas en 90 días.");
  });

  it("quietos sin kits que convengan: lo dice y explica en las notas", () => {
    const text = composeKitsAnswer(datos({ kits: [], sinKit: [{ nombre: "Carpeta lenta Prueba", motivo: "no hay piezas que se vendan en su familia" }] }), "");
    expect(text).toContain("## Kits\n\nNo encontré kits que convengan con estos productos.");
    expect(text).toContain("- Sin kit: Carpeta lenta Prueba — no hay piezas que se vendan en su familia.");
  });

  it("el texto del modelo: nombre corto válido, sin precios ni porcentajes; un nombre con monto no se usa", () => {
    const model = readModelKits("[[KIT-1]] **Kit $9.900**\n✨ Lo que amarás\n- Algo\n- Ahorra 13 %\n[[KIT-2]] — Kit de oficina —\n📦 Incluye: A y B");
    expect(model.get("[[KIT-1]]")).toEqual({ name: null, copy: "✨ Lo que amarás\n- Algo" });
    expect(model.get("[[KIT-2]]")).toEqual({ name: "Kit de oficina", copy: "📦 Incluye: A y B" });
    expect(readModelKits("Según la herramienta… [[KIT-1]] Kit escolar").get("[[KIT-1]]")?.name).toBe("Kit escolar");
  });

  it("el chat lo pinta en secciones, con la lista de piezas anidada y los bloques plegables", () => {
    const blocks = parseAnswer(composeKitsAnswer(datos(), MODEL));
    expect(blocks.filter((block) => block.type === "heading").map((block) => (block as { text: string }).text)).toEqual([
      "Resumen",
      "Los 3 con más plata quieta",
      "1 kit sugerido",
      "🎓 Kit de grados",
      "Notas",
    ]);
    expect(blocks.filter((block) => block.type === "details" || block.type === "copy").map((block) => block.type)).toEqual(["details", "copy"]);
  });
});
