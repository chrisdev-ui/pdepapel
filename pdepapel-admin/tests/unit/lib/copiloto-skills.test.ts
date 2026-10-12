import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ owner: vi.fn() }));
vi.mock("@/lib/store-access", () => ({ requireStoreOwner: mocks.owner }));

import { descriptionBlockToHtml, descriptionBlockToPlainText, extractDescriptionBlock } from "@/lib/copiloto/description-html";
import { buildCopilotContext, buildCopilotSystemPrompt } from "@/lib/copiloto/prompt";
import { COPILOT_SKILLS, activeToolNames, loadedSkillIds, renderSkillIndex } from "@/lib/copiloto/skills";
import { DESCRIPTION_MARKERS, DESCRIPTIONS_SKILL_INSTRUCTIONS } from "@/lib/copiloto/skills/descripciones";
import { descriptionToLines } from "@/lib/copiloto/skills/descripciones-tool";
import { buildSkillTools } from "@/lib/copiloto/skills/tools";
import { sanitizeRichTextHtml } from "@/lib/rich-text";

beforeEach(() => {
  mocks.owner.mockReset().mockResolvedValue("user_owner");
});

describe("índice de habilidades", () => {
  it("una línea corta por habilidad y la regla de cargarlas antes de responder", () => {
    const index = renderSkillIndex();
    for (const skill of COPILOT_SKILLS) {
      expect(index).toContain(`- ${skill.id}: ${skill.resumen}`);
      expect(skill.resumen.length).toBeLessThan(200);
    }
    expect(index).toContain("llama cargarHabilidad");
    expect(index).toContain("no cargues ninguna");
  });

  it("el prefijo fijo no cambia con la hora, la pantalla ni las habilidades cargadas", () => {
    const knowledge = [
      { id: "a", titulo: "A", body: "general", habilidad: null },
      { id: "b", titulo: "B", body: "solo marketing", habilidad: "marketing" },
    ];
    const prompt = buildCopilotSystemPrompt({ knowledge });
    expect(prompt).toBe(buildCopilotSystemPrompt({ knowledge }));
    expect(prompt).toContain("general");
    expect(prompt).not.toContain("solo marketing");
    const context = buildCopilotContext({ knowledge, loadedSkills: ["marketing"], now: new Date("2026-10-12T15:00:00Z"), pendingBrands: [] });
    expect(context).toContain("Habilidad Marketing (cargada)");
    expect(context).toContain("[conocimiento: b]");
    expect(context).toContain("No las vuelvas a cargar");
  });

  it("las habilidades cargadas salen de las llamadas guardadas; las fallidas o desconocidas no cuentan", () => {
    const part = (id: string, ok = true, state = "output-available") => ({ type: "tool-cargarHabilidad", state, output: { ok, id } });
    expect(
      loadedSkillIds([
        { parts: [part("marketing")] },
        { parts: [part("descripciones", false), part("inventada"), part("descripciones", true, "input-available")] },
        { parts: "basura" },
      ]),
    ).toEqual(["marketing"]);
  });

  it("herramientas: las de siempre, cargarHabilidad, y las de una habilidad solo si está cargada", () => {
    expect(activeToolNames(["a", "b"], [])).toEqual(["a", "b", "cargarHabilidad"]);
    expect(activeToolNames(["a", "b"], ["descripciones"])).toEqual(["a", "b", "cargarHabilidad", "productoParaDescripcion"]);
    expect(activeToolNames(["a"], ["marketing"])).toEqual(["a", "cargarHabilidad"]);
  });
});

describe("cargarHabilidad", () => {
  const notesFor = vi.fn(async (id: string) => (id === "descripciones" ? [{ id: "plantilla-descripciones", titulo: "Plantilla", body: "Preferencias" }] : []));
  const exec = (alreadyLoaded: string[], id: string) =>
    (buildSkillTools("store-1", { alreadyLoaded, notesFor }).cargarHabilidad as unknown as { execute: (input: { id: string }) => Promise<Record<string, unknown>> }).execute({ id });

  it("devuelve las instrucciones y las notas de la habilidad", async () => {
    const result = await exec([], "Descripciones");
    expect(result).toMatchObject({ ok: true, id: "descripciones", herramientas: ["productoParaDescripcion"] });
    expect(String(result.instrucciones)).toContain("Habilidad Descripciones (cargada)");
    expect(String(result.instrucciones)).toContain("[conocimiento: plantilla-descripciones]");
    expect(mocks.owner).toHaveBeenCalledWith("store-1");
  });

  it("un id que no existe responde con la lista de las válidas", async () => {
    expect(await exec([], "contabilidad")).toEqual({ ok: false, error: "No existe la habilidad «contabilidad».", validas: ["descripciones", "marketing"] });
  });

  it("si ya estaba cargada no repite las instrucciones", async () => {
    const result = await exec(["marketing"], "marketing");
    expect(result).toMatchObject({ ok: true, id: "marketing", yaCargada: true });
    expect(result.instrucciones).toBeUndefined();
  });
});

describe("habilidad descripciones", () => {
  it("las reglas firmes están en las instrucciones", () => {
    for (const rule of ["escasezPermitida: true", "popularidadPermitida: true", "marcaVaciaEnFicha: true", "Marca vacía en la ficha", "Estatuto del Consumidor", "nunca copies sus datos", DESCRIPTION_MARKERS.prospect]) {
      expect(DESCRIPTIONS_SKILL_INSTRUCTIONS).toContain(rule);
    }
    for (const marker of Object.values(DESCRIPTION_MARKERS)) expect(DESCRIPTIONS_SKILL_INSTRUCTIONS).toContain(marker);
  });

  it("la descripción actual llega como líneas y viñetas, sin etiquetas", () => {
    expect(descriptionToLines("<h3>¡Hola!</h3><p>Texto &amp; más</p><ul><li><p><strong>Marca:</strong> X</p></li></ul>")).toBe("¡Hola!\nTexto & más\n- Marca: X");
    expect(descriptionToLines("")).toBeNull();
    expect(descriptionToLines(`<p>${"a".repeat(50)}</p>`, 10)).toBe("aaaaaaaaaa…");
  });
});

describe("Copiar para la ficha", () => {
  const ANSWER = [
    `${DESCRIPTION_MARKERS.name} Set de plumígrafos WORKPAL x8 colores 0,7 mm`,
    "",
    DESCRIPTION_MARKERS.description,
    "¡Líneas finas para cada detalle!",
    "¿Te gusta dibujar? ✨ El **Set de Plumígrafos WORKPAL x8** es para dibujo lineal <y> mandalas.",
    "**🔥 ¿Por qué te van a encantar?**",
    "- **Punta de 0,7 mm:** líneas finas y uniformes.",
    "- **8 colores:** para combinar tonos.",
    "**📌 Especificaciones Técnicas**",
    "- **Marca:** WORKPAL.",
    "⚡ ¡Agrégalo a tu carrito! 🛒🖊️",
    "",
    DESCRIPTION_MARKERS.seo,
    "- Título: Set de plumígrafos WORKPAL x8",
    DESCRIPTION_MARKERS.missing,
    "- Medidas",
  ].join("\n");

  it("toma solo el bloque de la descripción, sin el nombre, el SEO ni los datos que faltan", () => {
    const block = extractDescriptionBlock(ANSWER)!;
    expect(block.startsWith("¡Líneas finas")).toBe(true);
    expect(block).not.toContain("Título:");
    expect(block).not.toContain("Medidas");
    expect(extractDescriptionBlock("una respuesta cualquiera")).toBeNull();
  });

  it("arma el HTML de la plantilla y el sanitizador del editor lo deja igual", () => {
    const html = descriptionBlockToHtml(extractDescriptionBlock(ANSWER)!);
    expect(html).toBe(
      "<h3>¡Líneas finas para cada detalle!</h3>" +
        "<p>¿Te gusta dibujar? ✨ El <strong>Set de Plumígrafos WORKPAL x8</strong> es para dibujo lineal &lt;y&gt; mandalas.</p>" +
        "<h3>🔥 ¿Por qué te van a encantar?</h3>" +
        "<ul><li><strong>Punta de 0,7 mm:</strong> líneas finas y uniformes.</li><li><strong>8 colores:</strong> para combinar tonos.</li></ul>" +
        "<h3>📌 Especificaciones Técnicas</h3>" +
        "<ul><li><strong>Marca:</strong> WORKPAL.</li></ul>" +
        "<p>⚡ ¡Agrégalo a tu carrito! 🛒🖊️</p>",
    );
    expect(sanitizeRichTextHtml(html)).toBe(html);
  });

  it("el respaldo en texto plano conserva líneas y viñetas", () => {
    expect(descriptionBlockToPlainText("¡Hola!\n- **Marca:** X.")).toBe("¡Hola!\n• Marca: X.");
  });
});
