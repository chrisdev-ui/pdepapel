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

  it("sin nombre corto ni texto del modelo: queda el nombre de la herramienta y un texto base con sus propias piezas", () => {
    const text = composeKitsAnswer(datos(), "");
    expect(text).toContain("### 🎓 Kit Grados con Libreta lenta Prueba");
    expect(text).toContain(":::copiar Texto para la ficha (base)\n✨ Ocasión: grados\n📦 Incluye: Libreta lenta Prueba, Lápiz Prueba y Borrador Prueba\n🎁 Ideal para regalar.\n:::");
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

  describe("lo que el modelo escribe de verdad (formas raras)", () => {
    const TEMPLATE = "✨ Lo que amarás\n- Algo bonito\n- Algo útil\n📦 Incluye: A y B\n🎁 Ideal para regalar a tu amiga.";
    const read = (text: string, marker = "[[KIT-1]]") => readModelKits(text).get(marker);

    it("el nombre en el renglón siguiente al marcador", () => {
      expect(read(`[[KIT-1]]\nKit de grados\n${TEMPLATE}`)).toEqual({ name: "Kit de grados", copy: TEMPLATE });
    });

    it("todo en un solo renglón: nombre y plantilla se separan", () => {
      expect(read("[[KIT-1]] Kit de grados ✨ Lo que amarás - Algo bonito - Algo útil 📦 Incluye: A y B")).toEqual({
        name: "Kit de grados",
        copy: "✨ Lo que amarás\n- Algo bonito\n- Algo útil\n📦 Incluye: A y B",
      });
    });

    it("el marcador al final de un encabezado: el nombre es lo de antes", () => {
      expect(read(`### **Kit de grados** [[KIT-1]]\n${TEMPLATE}`)?.name).toBe("Kit de grados");
    });

    it("una nota y un «:::detalle» después de la plantilla nunca entran al texto para la ficha", () => {
      const result = read(`[[KIT-1]] Kit de grados\n${TEMPLATE}\nLa libreta no alcanza para armar tres kits. :::detalle Para tener en cuenta\n- Solo hay 2.\n:::`);
      expect(result?.copy).toBe(TEMPLATE);
    });

    it("su propio bloque «:::copiar»: solo las líneas de la plantilla de adentro", () => {
      const result = read(`[[KIT-1]] Kit de grados\n:::copiar Texto para la ficha\n${TEMPLATE}\nPrecio especial: $9.900\n:::\nNota para Paula: revisa el stock.`);
      expect(result?.copy).toBe(TEMPLATE);
    });

    it("sin plantilla, solo una nota: no hay texto para la ficha", () => {
      expect(read("[[KIT-1]] Kit de grados\nLa libreta no alcanza para armar tres kits con el mínimo de unidades. :::detalle Para tener en cuenta")?.copy).toBe("");
    });

    it("un nombre largo (el del producto completo) no se usa", () => {
      expect(read(`[[KIT-1]] Kit Útiles escolares con Set de plumones doble punta pincel y fina 24 colores\n${TEMPLATE}`)?.name).toBeNull();
    });

    it("marcadores escritos de otra forma ([[KIT 2]], [[kit-2]]) se reconocen", () => {
      expect(read(`[[KIT 2]] Kit de oficina\n${TEMPLATE}`, "[[KIT-2]]")?.name).toBe("Kit de oficina");
      expect(read(`[[kit-2]] Kit de oficina\n${TEMPLATE}`, "[[KIT-2]]")?.copy).toBe(TEMPLATE);
    });
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

  describe("réplica de la respuesta de producción del 2026-10-16", () => {
    // La forma que dejó la respuesta real: el modelo copió los nombres largos de la herramienta detrás de cada marcador, no escribió ninguna plantilla y dejó una nota con «:::detalle» al final.
    const PRODUCTION_SHAPE = [
      "[[KIT-1]] Kit Útiles escolares con Set de plumones Prueba doble punta pincel y fina 24 colores",
      "[[KIT-2]] Kit Útiles escolares con Cartuchera Prueba de tres compartimentos con cremallera",
      "[[KIT-3]] Kit Regalo con Maleta conejito Prueba para niñas con ruedas y manija",
      "La maleta conejito Prueba no alcanza para armar tres kits con el mínimo de unidades. :::detalle Para tener en cuenta",
      "- Con 2 disponibles se arman solo 2 kits.",
      ":::",
    ].join("\n");
    const piezas = (lenta: string, otra: string) => [
      { nombre: lenta, rol: "lento", precioEfectivo: 20000 },
      { nombre: otra, rol: "se vende", precioEfectivo: 6000 },
      { nombre: `Borrador ${otra}`, rol: "se vende", precioEfectivo: 3000 },
    ];
    const production = datos({
      criterios: { diasSinVenta: 90, lineasSinFamilia: [], margenCriterioPanelPct: 35, precioMinimoPiezaLenta: 5000 },
      lentos: [
        { nombre: "Set de plumones Prueba doble punta pincel y fina 24 colores", disponible: 8, plataQuietaACosto: 60000, ultimaVenta: "hace 120 días" },
        { nombre: "Sobre de manila oficio Prueba x unidad", disponible: 200, plataQuietaACosto: 30000, ultimaVenta: "hace 200 días" },
      ],
      quietosDeBajoValor: { cantidad: 1, nombres: ["Sobre de manila oficio Prueba x unidad"], productos: [{ nombre: "Sobre de manila oficio Prueba x unidad", precioEfectivo: 300, motivo: "precio unitario bajo" }] },
      kits: [
        kit({ nombreSugerido: "Kit Útiles escolares con plumones", ocasion: "Útiles escolares", marcador: "[[KIT-1]]", piezas: piezas("Set de plumones Prueba doble punta pincel y fina 24 colores", "Cuaderno Prueba"), margenPct: 30, margenBajo: true }),
        kit({ nombreSugerido: "Kit Útiles escolares", ocasion: "Útiles escolares", marcador: "[[KIT-2]]", piezas: piezas("Cartuchera Prueba de tres compartimentos con cremallera", "Regla Prueba"), margenPct: 28, margenBajo: true }),
        kit({ nombreSugerido: "Kit Regalo con maletas", ocasion: "Regalo", marcador: "[[KIT-3]]", piezas: piezas("Maleta conejito Prueba para niñas con ruedas y manija", "Libreta Prueba"), margenPct: 25, margenBajo: true }),
      ],
    });
    const text = composeKitsAnswer(production, PRODUCTION_SHAPE);
    const blocks = parseAnswer(text);
    const kitTitles = blocks.filter((block) => block.type === "heading" && block.level === 3).map((block) => (block as { text: string }).text.replace(/^\S+\s/, ""));
    const copies = blocks.filter((block): block is Extract<typeof block, { type: "copy" }> => block.type === "copy");

    it("cada kit trae su texto para la ficha, solo con su plantilla y sus propias piezas", () => {
      expect(copies).toHaveLength(3);
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
      expect(kitTitles).toEqual(["Kit Útiles escolares con plumones", "Kit Útiles escolares", "Kit Regalo con maletas"]);
      expect(new Set(kitTitles).size).toBe(3);
      expect(kitTitles.every((title) => title.split(/\s+/).length <= 6)).toBe(true);
    });

    it("«margen bajo» dice la meta, y el sobre barato explica por qué no entra en kits", () => {
      expect(text.match(/\[\[tag:margen bajo \(meta 35 %\)\]\]/g)).toHaveLength(3);
      expect(text).toContain("2. Sobre de manila oficio Prueba x unidad · 200 und · sin ventas hace 200 días · $30.000 a costo [[tag:no va en kits]]");
      expect(text).toContain("- Sobre de manila oficio Prueba x unidad no entra en kits porque su precio por unidad es muy bajo ($300; una pieza quieta debe valer al menos $5.000). Mejor en promo o en un combo de caja.");
    });
  });

  it("dos kits con el mismo nombre del modelo: el segundo toma el de la herramienta", () => {
    const other = kit({ nombreSugerido: "Kit Útiles con Carpeta", marcador: "[[KIT-2]]" });
    const text = composeKitsAnswer(datos({ kits: [kit(), other] }), "[[KIT-1]] Kit de grados\n📦 Incluye: A\n[[KIT-2]] Kit de grados\n📦 Incluye: B");
    expect(text).toContain("### 🎓 Kit de grados");
    expect(text).toContain("### 🎓 Kit Útiles con Carpeta");
  });

  it("un kit sin marcador nunca toma el texto de otro: va el texto base con sus piezas", () => {
    const other = kit({ nombreSugerido: "Kit Útiles con Carpeta", marcador: "[[KIT-2]]", piezas: [{ nombre: "Carpeta Prueba", rol: "lento", precioEfectivo: 9000 }] });
    const text = composeKitsAnswer(datos({ kits: [kit(), other] }), "[[KIT-1]] Kit de grados\n📦 Incluye: Libreta lenta Prueba");
    const copies = parseAnswer(text).filter((block) => block.type === "copy") as { title: string; text: string }[];
    expect(copies.map((copy) => [copy.title, copy.text])).toEqual([
      ["Texto para la ficha", "📦 Incluye: Libreta lenta Prueba"],
      ["Texto para la ficha (base)", "✨ Ocasión: grados\n📦 Incluye: Carpeta Prueba\n🎁 Ideal para regalar."],
    ]);
  });
});
