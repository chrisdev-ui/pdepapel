import { describe, expect, it } from "vitest";

import { bulletList, collapsible, copyBlock, heading, keyLine, numberedList, parseAnswer, plainCopyText, sections, splitTags, tag } from "@/lib/copiloto/answer-blocks";

describe("formato de las respuestas del copiloto", () => {
  it("secciones, numeradas, viñetas anidadas por sangría y párrafos", () => {
    const text = ["## Resumen", "Hay **2** quietos.", "", "1. Libreta · 8 und", "2. Carpeta · 6 und", "", "### Kit", "- Libreta [[tag:quieto]]", "  - detalle", "    - más", "- Lápiz"].join("\n");
    expect(parseAnswer(text)).toEqual([
      { type: "heading", level: 2, text: "Resumen" },
      { type: "paragraph", text: "Hay **2** quietos." },
      { type: "spacer" },
      { type: "list", ordered: true, items: [{ text: "Libreta · 8 und", children: null }, { text: "Carpeta · 6 und", children: null }] },
      { type: "spacer" },
      { type: "heading", level: 3, text: "Kit" },
      {
        type: "list",
        ordered: false,
        items: [
          { text: "Libreta [[tag:quieto]]", children: { type: "list", ordered: false, items: [{ text: "detalle", children: { type: "list", ordered: false, items: [{ text: "más", children: null }] } }] } },
          { text: "Lápiz", children: null },
        ],
      },
    ]);
  });

  it("un renglón con sangría y sin viñeta sigue a su viñeta (antes se pintaba suelto)", () => {
    expect(parseAnswer("- Kit escolar\n  útiles para el colegio\n- Otro")).toEqual([
      { type: "list", ordered: false, items: [{ text: "Kit escolar útiles para el colegio", children: null }, { text: "Otro", children: null }] },
    ]);
  });

  it("bloques plegables y de copiar; el de copiar guarda su texto tal cual", () => {
    const text = [":::detalle Por qué estos productos", "- uno", "- dos", ":::", ":::copiar Texto para la ficha", "✨ Lo que amarás", "- Algo lindo", ":::"].join("\n");
    const [details, copy] = parseAnswer(text);
    expect(details).toMatchObject({ type: "details", title: "Por qué estos productos", closed: true, blocks: [{ type: "list" }] });
    expect(copy).toMatchObject({ type: "copy", title: "Texto para la ficha", closed: true, text: "✨ Lo que amarás\n- Algo lindo" });
  });

  it("un bloque sin cerrar (la respuesta todavía llegando) se pinta abierto y no se come el texto", () => {
    const [block] = parseAnswer(":::copiar Texto\n✨ Lo que amarás\n- Algo");
    expect(block).toMatchObject({ type: "copy", closed: false, text: "✨ Lo que amarás\n- Algo" });
    expect(JSON.stringify(block)).toContain("Algo");
  });

  it("una respuesta vieja (viñetas y negrita) se lee igual", () => {
    const text = "Hay 2 lentos.\n\n- **Kit escolar** — útiles\n  - Libreta (lento): $9.000\n  - Por qué:\n    - Libreta: 120 días";
    const blocks = parseAnswer(text);
    expect(blocks[0]).toEqual({ type: "paragraph", text: "Hay 2 lentos." });
    expect(blocks[2]).toMatchObject({ type: "list", items: [{ text: "**Kit escolar** — útiles", children: { items: [{ text: "Libreta (lento): $9.000" }, { text: "Por qué:", children: { items: [{ text: "Libreta: 120 días" }] } }] } }] });
  });

  it("etiquetas: se separan del texto; [[KIT-1]] no es una etiqueta", () => {
    expect(splitTags("Libreta $9.000 [[tag:quieto]] y [[KIT-1]]")).toEqual([
      { type: "text", text: "Libreta $9.000 " },
      { type: "tag", label: "quieto" },
      { type: "text", text: " y [[KIT-1]]" },
    ]);
  });

  it("al copiar no van etiquetas (la negrita la convierte el HTML o el texto plano)", () => {
    expect(plainCopyText("📦 Incluye: **Libreta** [[tag:quieto]]\n- Algo  ")).toBe("📦 Incluye: **Libreta**\n- Algo");
  });

  it("las piezas arman el mismo formato que el parser lee", () => {
    const text = sections(
      heading("Resumen"),
      keyLine("$21.900", ["por separado $25.500", "ahorro 14,1 %"]),
      numberedList(["a", "b"]),
      bulletList([`Libreta ${tag("quieto")}`]),
      collapsible("Por qué estos productos", bulletList(["uno"])),
      copyBlock("Texto para la ficha", "✨ Lo que amarás"),
      null,
    );
    expect(text).toBe(
      "## Resumen\n\n**$21.900** · por separado $25.500 · ahorro 14,1 %\n\n1. a\n2. b\n\n- Libreta [[tag:quieto]]\n\n:::detalle Por qué estos productos\n- uno\n:::\n\n:::copiar Texto para la ficha\n✨ Lo que amarás\n:::",
    );
    expect(parseAnswer(text).map((block) => block.type)).toEqual(["heading", "spacer", "paragraph", "spacer", "list", "spacer", "list", "spacer", "details", "spacer", "copy"]);
  });
});
