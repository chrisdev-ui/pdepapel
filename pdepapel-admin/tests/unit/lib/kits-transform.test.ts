import { describe, expect, it } from "vitest";

import { kitsAnswerTransform, placeFixedLines, reconcileKitAnswer, type KitOutput } from "@/lib/copiloto/skills/kits-transform";

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
const kitOf = (name: string, pieces: [string, number][], ahorro: number, sugerido: number, slow = 1): KitOutput => ({
  nombreSugerido: name,
  piezas: pieces.map(([nombre, precioEfectivo], index) => ({ nombre, precioEfectivo, rol: index < slow ? "lento" : "se vende" })),
  ahorroParaLaClienta: ahorro,
  detalle: [
    ...pieces.map(([nombre, precio], index) => `  - ${nombre} (${index < slow ? "lento" : "se vende"}): $${precio.toLocaleString("es-CO")}`),
    `  - precio sugerido $${sugerido.toLocaleString("es-CO")} · ahorro $${ahorro.toLocaleString("es-CO")} (12 %).`,
  ].join("\n"),
});
const grados = kitOf("Kit de grados con Libreta", [["Libreta lenta", 6000], ["Lápiz HB", 4000], ["Regla", 2500]], 1600, 10900);
const oficina = kitOf("Kit de oficina con Agenda", [["Agenda roja", 9000], ["Lápiz HB", 4000], ["Clips", 2500]], 1900, 13600);
const listed = (kit: KitOutput) => `- **${kit.nombreSugerido}** — útiles\n${kit.detalle}`;
const kitsResult = (kits: KitOutput[], linea: string | null = null) => ({ type: "tool-result", toolName: "kitsParaRotar", output: { datos: { nuevosSinDatosDeVenta: { linea }, kits } } });

describe("cada kit con el detalle de la herramienta, tal cual", () => {
  it("(a) un kit que ya trae su detalle, reconocido por sus piezas, no se repite", () => {
    const answer = `${listed(grados)}\nFunciona porque se compran juntos.`;
    expect(reconcileKitAnswer(answer, [grados])).toBe(answer);
  });

  it("(a) otro kit que comparte precios con el listado no cuenta como listado: se agrega el suyo", () => {
    const answer = listed(grados);
    const out = reconcileKitAnswer(answer, [grados, oficina]);
    expect(out.startsWith(answer)).toBe(true);
    expect(out.match(/Detalle de/g)).toHaveLength(1);
    expect(out).toContain(`**Detalle de «Kit de oficina con Agenda»**\n${oficina.detalle}`);
  });

  it("(a) un kit contado en prosa (aunque con los mismos números) recibe su detalle bajo la viñeta, sin dos precios", () => {
    const answer = [
      "Lentos: Libreta lenta, 8 disponibles, $24.000 quietos.",
      "- **Kit de grados** — para grados.\n  Incluye Libreta lenta ($6.000), Lápiz HB ($4.000) y Regla ($2.500); precio $10.900, ahorro $1.600.\n  Funciona porque se compran juntos.",
      "Son borradores.",
    ].join("\n\n");
    const out = reconcileKitAnswer(answer, [grados]);
    expect(out.split("\n\n")[1]).toBe(`- **Kit de grados** — para grados.\n${grados.detalle}\n  Funciona porque se compran juntos.`);
    expect(out.match(/\$10\.900/g)).toHaveLength(1);
    expect(out).toContain("$24.000 quietos");
  });

  it("(b) si el modelo da otro precio, gana el de la herramienta y no quedan dos precios para el mismo kit", () => {
    const answer = "Kit de grados con Libreta lenta, Lápiz HB y Regla.\nPrecio sugerido $9.900 y ahorro $2.600.\nSe pueden armar 8.\n\n📦 Incluye: Libreta lenta, Lápiz HB, Regla.";
    const out = reconcileKitAnswer(answer, [grados]);
    expect(out).not.toContain("$9.900");
    expect(out).not.toContain("$2.600");
    expect(out).toContain("precio sugerido $10.900 · ahorro $1.600 (12 %)");
    expect(out.match(/\$10\.900/g)).toHaveLength(1);
    expect(out).toContain("📦 Incluye: Libreta lenta, Lápiz HB, Regla.");
  });

  it("(b) por la ruta del chat: el texto del modelo se corrige antes de salir", async () => {
    const text = await run([
      kitsResult([grados], "Nuevos sin datos de venta: 1 (no se tratan como lentos)."),
      { type: "text-start", id: "t1" },
      { type: "text-delta", id: "t1", text: "- **Kit de grados** con Libreta lenta, Lápiz HB y Regla.\n" },
      { type: "text-delta", id: "t1", text: "  - Lápiz HB: $3.500\n  Precio $10.900, ahorro $1.600." },
      { type: "text-end", id: "t1" },
      { type: "finish" },
    ]);
    expect(text).not.toContain("$3.500");
    expect(text).toContain("  - Lápiz HB (se vende): $4.000");
    expect(text.trim().endsWith("Nuevos sin datos de venta: 1 (no se tratan como lentos).")).toBe(true);
  });

  it("si el flujo se corta sin «finish», lo guardado sale igual", async () => {
    const text = await run([kitsResult([grados]), { type: "text-delta", id: "t1", text: "Kit con Libreta lenta y Lápiz HB." }]);
    expect(text).toContain("Kit con Libreta lenta y Lápiz HB.");
    expect(text).toContain("Detalle de «Kit de grados con Libreta»");
  });

  const conLibreta = kitOf("Kit A", [["Libreta lenta", 6000], ["Lápiz HB", 4000], ["Regla", 2500]], 1600, 10900);
  const conAgenda = kitOf("Kit B", [["Agenda roja", 9000], ["Lápiz HB", 4000], ["Regla", 2500]], 1900, 13600);

  it("dos kits que comparten las piezas que se venden, cada uno con su detalle, quedan tal cual", () => {
    const answer = [listed(conLibreta), listed(conAgenda), "Son borradores."].join("\n\n");
    expect(reconcileKitAnswer(answer, [conLibreta, conAgenda])).toBe(answer);
  });

  it("si solo el segundo trae un precio equivocado, solo se corrige ese y el primero no se toca", () => {
    const first = listed(conLibreta);
    const answer = [first, "- **Kit B** con Agenda roja, Lápiz HB y Regla: precio $12.500.", "Son borradores."].join("\n\n");
    const out = reconcileKitAnswer(answer, [conLibreta, conAgenda]);
    expect(out.startsWith(`${first}\n\n`)).toBe(true);
    expect(out).not.toContain("$12.500");
    expect(out.split("\n\n")[1]).toBe(`- **Kit B**\n${conAgenda.detalle}`);
    expect(out).not.toContain("Detalle de «Kit A»");
  });

  it("el detalle de un kit que nombra a otro («comparte stock con «Kit … Carpeta…»») no lo hace pasar por el otro", () => {
    const libreta = { ...kitOf("Kit con Libreta lenta", [["Libreta lenta", 9000], ["Marcador", 6000], ["Borrador", 3000]], 3600, 14900) };
    libreta.detalle = libreta.detalle!.replace("  - Borrador (se vende): $3.000", "  - Borrador (se vende): $3.000 · comparte stock con «Kit con Carpeta lenta»");
    const carpeta = kitOf("Kit con Carpeta lenta", [["Carpeta lenta", 9000], ["Marcador", 6000], ["Borrador", 3000]], 3100, 14900);
    const first = `- **Kit con libreta**\n${libreta.detalle}`;
    const answer = [first, "- **Kit con carpeta** con Carpeta lenta, Marcador y Borrador.\n  Funciona porque se compran juntos.", "Son borradores."].join("\n\n");
    const out = reconcileKitAnswer(answer, [libreta, carpeta]);
    expect(out.split("\n\n")[0]).toBe(first);
    expect(out.split("\n\n")[1]).toBe(`- **Kit con carpeta** con Carpeta lenta, Marcador y Borrador.\n${carpeta.detalle}\n  Funciona porque se compran juntos.`);
  });

  it("dos kits en un mismo párrafo: cada detalle va bajo su propia viñeta", () => {
    const answer = "- **Kit A** con Libreta lenta, Lápiz HB y Regla.\n- **Kit B** con Agenda roja, Lápiz HB y Regla.";
    const out = reconcileKitAnswer(answer, [conLibreta, conAgenda]);
    expect(out).toBe(`- **Kit A** con Libreta lenta, Lápiz HB y Regla.\n${conLibreta.detalle}\n- **Kit B** con Agenda roja, Lápiz HB y Regla.\n${conAgenda.detalle}`);
  });

  it("un kit con dos lentas no toca la lista de lentos con su plata quieta", () => {
    const doble = kitOf("Kit doble", [["Libreta lenta", 6000], ["Agenda roja", 9000], ["Regla", 2500]], 2000, 15500, 2);
    const lentos = "Lentos:\n- Libreta lenta: $24.000 quietos a costo\n- Agenda roja: $18.000 quietos a costo";
    const answer = [lentos, listed(doble), "Son borradores."].join("\n\n");
    expect(reconcileKitAnswer(answer, [doble])).toBe(answer);
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

