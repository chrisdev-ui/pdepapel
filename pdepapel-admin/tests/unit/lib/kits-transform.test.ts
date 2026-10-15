import { describe, expect, it } from "vitest";

import { kitsAnswerTransform, placeFixedLines, reconcileKitAnswer, toolAmounts, type KitOutput } from "@/lib/copiloto/skills/kits-transform";

type Part = Record<string, unknown> & { type: string };

async function run(parts: Part[]): Promise<string> {
  const stream = new ReadableStream<Part>({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  }).pipeThrough(kitsAnswerTransform()({ tools: {}, stopStream: () => undefined } as never) as unknown as TransformStream<Part, Part>);
  let text = "";
  for await (const part of stream as unknown as AsyncIterable<Part>) if (part.type === "text-delta") text += part.text as string;
  return text;
}

const toolResult = (linea: string | null) => ({ type: "tool-result", toolName: "kitsParaRotar", output: { datos: { nuevosSinDatosDeVenta: { linea } } } });

describe("línea de productos nuevos en la respuesta de kits", () => {
  it("si el modelo no la escribió, se agrega al final, una sola vez", async () => {
    const text = await run([toolResult("Nuevos sin datos de venta: 108 (no se tratan como lentos)."), { type: "text-delta", text: "Hay 451 productos lentos." }, { type: "finish" }]);
    expect(text).toBe("Hay 451 productos lentos.\n\nNuevos sin datos de venta: 108 (no se tratan como lentos).");
  });

  it("si ya la trae (aunque sea con otra puntuación), no se repite", async () => {
    const text = await run([toolResult("Nuevos sin datos de venta: 3 (no se tratan como lentos)."), { type: "text-delta", text: "Lentos…\n\nNuevos sin datos de venta: 3 — no son lentos." }, { type: "finish" }]);
    expect(text.match(/Nuevos sin datos de venta/g)).toHaveLength(1);
  });

  it("sin productos nuevos, o sin la herramienta, no agrega nada", async () => {
    expect(await run([toolResult(null), { type: "text-delta", text: "Hola" }, { type: "finish" }])).toBe("Hola");
    expect(await run([{ type: "text-delta", text: "Hola" }, { type: "finish" }])).toBe("Hola");
  });
});

/** Las piezas lentas van primero; `slow` dice cuántas son. El detalle tiene la forma de `kitDetail`: sangrado bajo la viñeta del kit. */
const kitOf = (name: string, marcador: string, pieces: [string, number][], ahorro: number, sugerido: number, slow = 1): KitOutput => ({
  nombreSugerido: name,
  marcador,
  piezas: pieces.map(([nombre, precioEfectivo], index) => ({ nombre, precioEfectivo, rol: index < slow ? "lento" : "se vende" })),
  ahorroParaLaClienta: ahorro,
  detalle: [
    ...pieces.map(([nombre, precio], index) => `  - ${nombre} (${index < slow ? "lento" : "se vende"}): $${precio.toLocaleString("es-CO")}`),
    `  - precio sugerido $${sugerido.toLocaleString("es-CO")} · ahorro $${ahorro.toLocaleString("es-CO")} (12 %).`,
    "  - Por qué:",
    `    - ${pieces[1][0]}: su línea se compra junto con la de ${pieces[0][0]} (3 pedidos en 180 días)`,
  ].join("\n"),
});
const grados = kitOf("Kit de grados con Libreta", "[[KIT-1]]", [["Libreta lenta", 6000], ["Lápiz HB", 4000], ["Regla", 2500]], 1600, 10900);
const oficina = kitOf("Kit de oficina con Agenda", "[[KIT-2]]", [["Agenda roja", 9000], ["Lápiz HB", 4000], ["Regla", 2500]], 1900, 13600);
const kitsResult = (kits: KitOutput[], linea: string | null = null) => ({ type: "tool-result", toolName: "kitsParaRotar", output: { datos: { nuevosSinDatosDeVenta: { linea }, kits } } });

describe("cada kit con el detalle de la herramienta en su marcador", () => {
  it("el marcador se cambia por el detalle, tal cual, debajo de la viñeta del modelo", () => {
    const answer = "Lentos: Libreta lenta, $24.000 quietos.\n\n- **Kit de grados** — para grados\n[[KIT-1]]\n\nSon borradores.";
    expect(reconcileKitAnswer(answer, [grados], toolAmounts({ plataQuietaACosto: 24000, kits: [grados] }))).toBe(`Lentos: Libreta lenta, $24.000 quietos.\n\n- **Kit de grados** — para grados\n${grados.detalle}\n\nSon borradores.`);
  });

  it("un marcador en la misma línea de la viñeta también vale", () => {
    expect(reconcileKitAnswer("- **Kit de grados** — para grados [[KIT-1]]", [grados])).toBe(`- **Kit de grados** — para grados\n${grados.detalle}`);
  });

  it("un marcador sin viñeta encima recibe el nombre del kit", () => {
    expect(reconcileKitAnswer("Estos son los kits:\n\n[[KIT-1]]", [grados])).toBe(`Estos son los kits:\n\n- **Kit de grados con Libreta**\n${grados.detalle}`);
  });

  it("un kit sin marcador va al final, una sola vez, con su título", () => {
    const out = reconcileKitAnswer("- **Kit de grados** — para grados\n[[KIT-1]]\n\nSon borradores.", [grados, oficina]);
    expect(out.match(/Detalle de/g)).toHaveLength(1);
    expect(out.endsWith(`**Detalle de «Kit de oficina con Agenda»**\n${oficina.detalle}`)).toBe(true);
    expect(out.match(/Agenda roja \(lento\)/g)).toHaveLength(1);
  });

  it("un marcador repetido no repite el detalle", () => {
    const out = reconcileKitAnswer("- **Kit de grados**\n[[KIT-1]]\n\nOtra vez: [[KIT-1]]", [grados]);
    expect(out.match(/Libreta lenta \(lento\)/g)).toHaveLength(1);
  });

  it("las piezas, precios y cuentas que escriba el modelo se quitan: solo queda el detalle", () => {
    const answer = [
      "- **Kit de grados** — para grados",
      "[[KIT-1]]",
      "  - Lápiz HB (se vende): $3.500",
      "Precio sugerido $9.900 y ahorro $2.600.",
      "  - precio sugerido $10.900 · ahorro $1.600 (12 %).",
      "",
      "📦 Incluye: Libreta lenta, Lápiz HB, Regla.",
    ].join("\n");
    const out = reconcileKitAnswer(answer, [grados]);
    for (const wrong of ["$3.500", "$9.900", "$2.600"]) expect(out).not.toContain(wrong);
    expect(out.match(/\$10\.900/g)).toHaveLength(1);
    expect(out).toContain("📦 Incluye: Libreta lenta, Lápiz HB, Regla.");
  });

  it("una viñeta con un precio queda solo con el nombre del kit", () => {
    expect(reconcileKitAnswer("- **Kit de grados** — $10.900\n[[KIT-1]]", [grados])).toBe(`- **Kit de grados con Libreta**\n${grados.detalle}`);
  });

  it("el «Por qué» del modelo (y lo que cuelga de él) se quita: queda solo el de la herramienta", () => {
    const answer = ["- **Kit de grados** — para grados", "[[KIT-1]]", "  - Por qué: se compran juntos.", "    - y es temporada de grados", "Funciona porque son útiles.", "", "Son borradores."].join("\n");
    const out = reconcileKitAnswer(answer, [grados]);
    expect(out.match(/Por qué/g)).toHaveLength(1);
    expect(out).not.toContain("temporada de grados");
    expect(out).not.toContain("Funciona porque");
    expect(out).toBe(`- **Kit de grados** — para grados\n${grados.detalle}\n\nSon borradores.`);
  });

  it("un monto que no dio la herramienta se quita en cualquier parte; los suyos se quedan", () => {
    const answer = "Lentos: $24.000 quietos a costo.\nEl kit deja $5.555 de ganancia.\n\n- **Kit de grados**\n[[KIT-1]]";
    const out = reconcileKitAnswer(answer, [grados], new Set(["24000", "6000", "4000", "2500", "10900", "1600"]));
    expect(out).toContain("$24.000 quietos a costo.");
    expect(out).not.toContain("$5.555");
  });

  it("dos kits, cada uno en su marcador", () => {
    const out = reconcileKitAnswer("- **Kit A**\n[[KIT-1]]\n- **Kit B**\n[[KIT-2]]", [grados, oficina]);
    expect(out).toBe(`- **Kit A**\n${grados.detalle}\n- **Kit B**\n${oficina.detalle}`);
  });

  it("los montos permitidos salen de toda la salida de la herramienta", () => {
    expect(Array.from(toolAmounts({ datos: { plataQuietaACostoTotal: 24000.4, kits: [{ detalle: "  - Regla: $2.500" }] } })).sort()).toEqual(["24000", "2500"]);
  });

  it("por la ruta del chat: el marcador sale cambiado y la línea de nuevos al final", async () => {
    const text = await run([
      kitsResult([grados], "Nuevos sin datos de venta: 1 (no se tratan como lentos)."),
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", text: "- **Kit de grados** — para grados\n[[KI" },
      { type: "text-delta", id: "t1", text: "T-1]]\n  - Lápiz HB: $3.500" },
      { type: "text-end", id: "t1" },
      { type: "finish" },
    ]);
    expect(text).not.toContain("[[KIT");
    expect(text).not.toContain("$3.500");
    expect(text).toContain("  - Lápiz HB (se vende): $4.000");
    expect(text.trim().endsWith("Nuevos sin datos de venta: 1 (no se tratan como lentos).")).toBe(true);
  });

  it("si el flujo se corta sin «finish», lo guardado sale igual", async () => {
    const text = await run([kitsResult([grados]), { type: "text-delta", id: "t1", text: "Kit con Libreta lenta y Lápiz HB." }]);
    expect(text).toContain("Kit con Libreta lenta y Lápiz HB.");
    expect(text).toContain("Detalle de «Kit de grados con Libreta»");
  });
});

describe("líneas fijas del final: las pone la herramienta, una sola vez", () => {
  const nuevos = { text: "Nuevos sin datos de venta: 108 (no se tratan como lentos).", topic: /\bnuev[oa]s?\b|sin (suficientes )?datos de venta/i };
  const bajoValor = { text: "Quietos de bajo valor: 2 (mejor en promo o combo de caja).", topic: /bajo valor/i };

  it("si el modelo la dijo con sus palabras, se quita su frase y queda solo la fija", () => {
    const answer = "Hay 451 lentos. Hay 108 productos nuevos sin suficientes datos de venta; no los cuento como lentos. Estos son tres borradores.\n\nSon borradores.";
    const out = placeFixedLines(answer, [nuevos]);
    expect(out).toBe("Hay 451 lentos. Estos son tres borradores.\n\nSon borradores.\n\nNuevos sin datos de venta: 108 (no se tratan como lentos).");
    expect(out.match(/108/g)).toHaveLength(1);
  });

  it("si la copió tal cual, sigue saliendo una sola vez", () => {
    const answer = "Lentos.\n\nNuevos sin datos de venta: 108 (no se tratan como lentos).\n\nSon borradores.";
    const out = placeFixedLines(answer, [nuevos]);
    expect(out.match(/Nuevos sin datos de venta/g)).toHaveLength(1);
    expect(out.endsWith("Nuevos sin datos de venta: 108 (no se tratan como lentos).")).toBe(true);
  });

  it("solo quita frases con la misma cuenta: otro número o un monto que la contiene no se tocan", () => {
    const answer = "Entraron 3 productos nuevos esta semana. Hay $108.000 quietos en 1080 unidades.";
    expect(placeFixedLines(answer, [nuevos])).toBe(`${answer}\n\n${nuevos.text}`);
  });

  it("la de quietos de bajo valor va antes que la de nuevos, y por la ruta del chat las dos salen una vez", async () => {
    const text = await run([
      { type: "tool-result", toolName: "kitsParaRotar", output: { datos: { nuevosSinDatosDeVenta: { linea: nuevos.text }, quietosDeBajoValor: { linea: bajoValor.text }, kits: [] } } },
      { type: "text-delta", id: "t1", text: "Hay 2 quietos de bajo valor que conviene rematar. Hay 108 nuevos.\n\nSon borradores." },
      { type: "finish" },
    ]);
    expect(text).toBe(`Son borradores.\n\n${bajoValor.text}\n\n${nuevos.text}`);
  });
});

