import { zodSchema } from "ai";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({ env: {} }));
vi.mock("@/lib/prismadb", () => ({ default: {} }));
import { z } from "zod";

import {
  geminiOutputSchema,
  openAiStrictOutputSchema,
  toGeminiSchema,
} from "@/lib/ai-model-providers";
import { productImageAnalysisOutputSchema } from "@/lib/product-image-analysis";
import { photoFactsSchema } from "@/lib/product-image-analysis-pipeline";
import { iconSuggestionsOutputSchema } from "@/lib/type-icon-suggestions";
import { productClassificationSchema } from "@/lib/whatsapp/bot-products";
import { botReplyAssistantOutputSchema } from "@/lib/whatsapp/bot-reply-assistant";

describe("esquema para Gemini", () => {
  it("manda solo la forma: tipos, campos, obligatorios y opciones; sin topes ni patrones", async () => {
    const schema = await zodSchema(
      z.object({
        photos: z.array(z.number().int().min(0)).max(10),
        hex: z.string().regex(/^#[0-9A-F]{6}$/).nullable(),
        level: z.enum(["alta", "media", "baja"]),
        nested: z.object({ name: z.string().min(1) }).optional(),
      }),
    ).jsonSchema;

    const sent = JSON.stringify(toGeminiSchema(schema));

    expect(sent).not.toMatch(/maxItems|minimum|pattern|additionalProperties|\$schema/);
    expect(toGeminiSchema(schema)).toMatchObject({
      type: "object",
      required: ["photos", "hex", "level"],
      properties: {
        photos: { type: "array", items: { type: "integer" } },
        level: { type: "string", enum: ["alta", "media", "baja"] },
        nested: { type: "object", properties: { name: { type: "string", minLength: 1 } } },
      },
    });
  });

  it("el esquema de la pasada final conserva todos sus campos", async () => {
    const full = (await zodSchema(productImageAnalysisOutputSchema).jsonSchema) as {
      properties: Record<string, unknown>;
    };
    const sent = toGeminiSchema(full) as { properties: Record<string, unknown> };
    expect(Object.keys(sent.properties)).toEqual(Object.keys(full.properties));
  });
});

describe("cada uso de Gemini manda la forma recortada y valida con su zod", () => {
  const cases = [
    {
      feature: "asistente de productos: lectura de fotos",
      schema: photoFactsSchema,
      valid: { photos: [{ photo: 0, productType: "marcador", readableText: "", brandText: null, licence: null, designName: null, colorNames: [], showsSingleOption: true, quantity: null, quantityMixed: null, tip: null, measurements: null, material: null }] },
    },
    {
      feature: "asistente de productos: pasada final",
      schema: productImageAnalysisOutputSchema,
      valid: null,
    },
    {
      feature: "asistente de productos: subcategoría",
      schema: z.object({ categoryName: z.enum(["Ninguna de la lista", "Marcadores"]) }),
      valid: { categoryName: "Marcadores" },
    },
    {
      feature: "bot de WhatsApp: clasificación de productos",
      schema: productClassificationSchema,
      valid: { intent: "product.search", productType: "marcador" },
    },
    {
      feature: "Respuestas: asistente de respuestas",
      schema: botReplyAssistantOutputSchema,
      valid: { proposals: [{ label: "Envíos", triggers: ["envío"], answer: "Sí", reason: "Preguntan mucho" }] },
    },
    {
      feature: "Tipos: sugerencias de icono",
      schema: iconSuggestionsOutputSchema,
      valid: { proposals: [{ description: "Lápiz", svg: "<path d=\"M1 1\"/>" }] },
    },
  ];

  it.each(cases)("$feature", async ({ schema, valid }) => {
    const output = geminiOutputSchema(schema as z.ZodTypeAny);
    const sent = JSON.stringify(await output.jsonSchema);
    expect(sent).not.toMatch(/"(maxItems|minItems|maximum|minimum|maxLength|pattern|additionalProperties|default|\$schema)"/);
    expect(sent).toContain('"properties"');
    if (valid) {
      const result = await output.validate!(valid);
      expect(result.success).toBe(true);
      if (result.success) expect(result.value).toEqual((schema as z.ZodTypeAny).parse(valid));
    }
    const rejected = await output.validate!({ photos: "x", proposals: "x", intent: "x", categoryName: "x" });
    expect(rejected.success).toBe(false);
  });
});

describe("pasada final estricta en OpenAI", () => {
  const schema = z.object({
    name: z.string(),
    note: z.string().nullable(),
    tags: z.array(z.string()).default([]),
    evidence: z
      .object({ name: z.object({ photos: z.array(z.number()) }).optional() })
      .default({}),
    brand: z.string().optional(),
  });

  it("todas las propiedades obligatorias, las opcionales admiten null y no hay propiedades extra", async () => {
    const strict = (await openAiStrictOutputSchema(schema).jsonSchema) as Record<string, any>;
    const props = strict.properties;
    expect(strict.required).toEqual(Object.keys(props));
    expect(strict.additionalProperties).toBe(false);
    expect(props.brand.type).toEqual(["string", "null"]);
    expect(props.evidence.required).toEqual(["name"]);
    expect(props.evidence.additionalProperties).toBe(false);
    expect(JSON.stringify(strict)).not.toMatch(/"default"|"\$schema"/);
  });

  it("los null de campos opcionales vuelven a su valor por defecto antes del zod", async () => {
    const result = await openAiStrictOutputSchema(schema).validate!({
      name: "Set",
      note: null,
      tags: null,
      evidence: { name: null },
      brand: null,
    });
    expect(result).toEqual({
      success: true,
      value: { name: "Set", note: null, tags: [], evidence: {} },
    });
  });

  it("lo que el modo estricto no puede exigir (largos, topes, patrones, enteros) se ajusta en código antes del zod", async () => {
    const limited = z.object({
      observations: z.array(z.string().max(5)).max(2),
      colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullable(),
      photo: z.number().int().min(0).max(9),
    });
    const result = await openAiStrictOutputSchema(limited).validate!({
      observations: ["abcdefgh", "b", "c"],
      colorHex: "rosado",
      photo: 12.4,
    });
    expect(result).toEqual({
      success: true,
      value: { observations: ["abcde", "b"], colorHex: null, photo: 9 },
    });
  });

  it("el esquema real de la pasada final se convierte sin perder campos", async () => {
    const strict = (await openAiStrictOutputSchema(productImageAnalysisOutputSchema).jsonSchema) as Record<string, any>;
    expect(strict.required).toEqual(Object.keys(strict.properties));
    const full = (await zodSchema(productImageAnalysisOutputSchema).jsonSchema) as { properties: Record<string, unknown> };
    expect(Object.keys(strict.properties)).toEqual(Object.keys(full.properties));
  });
});
