import { describe, expect, it } from "vitest";

import { DESCRIPTION_MARKERS } from "@/lib/copiloto/skills/descripciones";
import { buildSpecs, extractDescriptionSpecs, missingSpecs, specCheckTransform, specWarning } from "@/lib/copiloto/skills/specs";

import { PAULA_REFERENCE_PRODUCT } from "../../../scripts/copilot-eval/fixtures/paula-referencia";

describe("especificaciones de la descripción", () => {
  it("lee solo la sección de especificaciones del HTML de Paula, no las viñetas de beneficios", () => {
    expect(extractDescriptionSpecs(PAULA_REFERENCE_PRODUCT.html)).toEqual([
      { clave: "Marca", valor: "Primavera" },
      { clave: "Cantidad", valor: "Set de 3 lapiceros / bolígrafos" },
      { clave: "Color de Tinta", valor: "Negra" },
      { clave: "Grosor de la Punta", valor: "0.7 mm (Punta Fina)" },
      { clave: "Mecanismo", valor: "Retráctil (con clic)" },
      { clave: "Tinta", valor: "A base de aceite / secado rápido" },
      { clave: "Presentación", valor: "Blíster protector x3" },
    ]);
  });

  it("sin sección de especificaciones, solo pares cortos", () => {
    expect(
      extractDescriptionSpecs("<ul><li>Marca: Eterna.</li><li>Ideal para: colegio, universidad, oficina, reuniones, clases, presentaciones y mucho más en tu día a día creativo</li></ul>"),
    ).toEqual([{ clave: "Marca", valor: "Eterna" }]);
  });

  it("lee líneas de texto plano con emoji y viñetas delante, y salta lo que no es un dato", () => {
    const text = "📦 **Contenido:** 50 hojas transparentes\n• Tamaño: 7,6 cm x 7,6 cm.\n💡 **Tip:**\n¿Por qué te van a encantar?\nhttps://x.y: no";
    expect(extractDescriptionSpecs(text)).toEqual([
      { clave: "Contenido", valor: "50 hojas transparentes" },
      { clave: "Tamaño", valor: "7,6 cm x 7,6 cm" },
    ]);
  });

  it("la ficha gana; si la descripción dice otra cosa queda por confirmar", () => {
    const { specs, conflicts } = buildSpecs({
      description: "<ul><li>Marca: Primavera</li><li>Color de tinta: Negra</li><li>marca: otra</li></ul>",
      fields: [
        { clave: "Marca", valor: "Offi-Esco" },
        { clave: "Color", valor: null },
      ],
    });
    expect(specs).toEqual([
      { clave: "Marca", valor: "Offi-Esco", fuente: "ficha" },
      { clave: "Color de tinta", valor: "Negra", fuente: "descripcion" },
    ]);
    expect(conflicts).toEqual([
      { clave: "Marca", ficha: "Offi-Esco", descripcion: "Primavera" },
      { clave: "Marca", ficha: "Offi-Esco", descripcion: "otra" },
    ]);
  });

  it("revisa los valores sin importar tildes, mayúsculas ni «0.7» contra «0,7»", () => {
    const specs = [
      { clave: "Grosor", valor: "0.7 mm" },
      { clave: "Tinta", valor: "A base de aceite" },
      { clave: "Presentación", valor: "Blíster protector x3" },
    ];
    expect(missingSpecs(specs, "- **Grosor de la punta:** 0,7 mm.\n- **Tinta:** a base de aceite.")).toEqual([specs[2]]);
    expect(specWarning([specs[2]])).toBe("⚠️ Faltó en especificaciones: Presentación: Blíster protector x3");
  });
});

describe("revisión al final de la respuesta", () => {
  const run = async (parts: unknown[]) => {
    const stream = new ReadableStream({
      start(controller) {
        for (const part of parts) controller.enqueue(part);
        controller.close();
      },
    }).pipeThrough(specCheckTransform()({ tools: {}, stopStream: () => undefined }) as never);
    const out: { type: string; text?: string }[] = [];
    const reader = (stream as ReadableStream).getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      out.push(value);
    }
    return out;
  };
  const toolResult = { type: "tool-result", toolName: "productoParaDescripcion", output: { datos: { especificaciones: [{ clave: "Marca", valor: "Primavera" }, { clave: "Grosor", valor: "0.7 mm" }] } } };

  it("si a la descripción le falta una especificación, agrega la línea antes de terminar", async () => {
    const out = await run([toolResult, { type: "text-delta", text: `${DESCRIPTION_MARKERS.description}\n- **Marca:** Primavera.` }, { type: "finish" }]);
    expect(out.map((part) => part.type)).toEqual(["tool-result", "text-delta", "text-start", "text-delta", "text-end", "finish"]);
    expect(out[3].text).toBe("\n\n⚠️ Faltó en especificaciones: Grosor: 0.7 mm");
  });

  it("no agrega nada si están todas, o si no escribió una descripción (por ejemplo, preguntó)", async () => {
    const complete = await run([toolResult, { type: "text-delta", text: `${DESCRIPTION_MARKERS.description}\nMarca: Primavera. Punta de 0,7 mm.` }, { type: "finish" }]);
    expect(complete.map((part) => part.type)).toEqual(["tool-result", "text-delta", "finish"]);
    const asked = await run([toolResult, { type: "text-delta", text: "¿Qué marca es?" }, { type: "finish" }]);
    expect(asked.map((part) => part.type)).toEqual(["tool-result", "text-delta", "finish"]);
  });
});
