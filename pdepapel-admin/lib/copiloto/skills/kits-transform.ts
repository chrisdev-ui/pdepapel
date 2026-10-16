import type { StreamTextTransform, TextStreamPart, ToolSet } from "ai";

import { composeKitsAnswer, type KitsAnswerData } from "@/lib/copiloto/skills/kits-answer";
import { KITS_TEXTS_TOOL, validateKitTexts } from "@/lib/copiloto/skills/kits-texts";

/** Solo para la evaluación: recibe lo que el modelo mandó a `textosDeKits` y su texto libre (nunca se guarda ni se registra en producción). */
export const kitsModelTextTap: { current: ((sent: { texts: unknown; text: string }) => void) | null } = { current: null };

/**
 * Cuando corre `kitsParaRotar`, la respuesta la arma el código
 * (lib/copiloto/skills/kits-answer.ts) con los datos de la herramienta y lo
 * que el modelo mandó a `textosDeKits` (nombre corto, dos frases, para qué es
 * ideal). Su texto libre se descarta. Por eso una respuesta de kits no llega
 * de a poco: sale entera al final, sin otra llamada al modelo.
 */
export function kitsAnswerTransform<TOOLS extends ToolSet>(): StreamTextTransform<TOOLS> {
  return () => {
    let held = "";
    let texts: unknown = null;
    let datos: KitsAnswerData | null = null;
    let done = false;
    const emit = (controller: TransformStreamDefaultController<TextStreamPart<TOOLS>>) => {
      done = true;
      const text = composeKitsAnswer(datos!, texts);
      kitsModelTextTap.current?.({ texts, text: held });
      const valid = validateKitTexts(texts);
      const kits = datos!.kits ?? [];
      const fromModel = kits.map((kit) => (kit.n !== undefined ? valid.get(kit.n) : undefined));
      // Solo la forma, nunca el texto: para saber qué entregó el modelo cuando una respuesta sale rara.
      console.info("[COPILOTO] Kits armados", {
        kits: kits.length,
        llamoTextos: texts !== null,
        conNombreDelModelo: fromModel.filter((item) => item?.name).length,
        conTextoDelModelo: fromModel.filter((item) => item?.bullets).length,
        base: fromModel.filter((item) => !item?.bullets).length,
      });
      const id = "kits-fijo";
      controller.enqueue({ type: "text-start", id } as TextStreamPart<TOOLS>);
      controller.enqueue({ type: "text-delta", id, text } as TextStreamPart<TOOLS>);
      controller.enqueue({ type: "text-end", id } as TextStreamPart<TOOLS>);
    };
    return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      transform(part, controller) {
        if (part.type === "tool-result" && part.toolName === "kitsParaRotar") {
          const output = part.output as { datos?: KitsAnswerData } | undefined;
          if (output?.datos) {
            datos = output.datos;
            held = "";
            texts = null;
          }
        }
        if (part.type === "tool-call" && part.toolName === KITS_TEXTS_TOOL && datos) texts = (part as { input?: unknown }).input ?? null;
        if (datos && (part.type === "text-start" || part.type === "text-end")) return;
        if (part.type === "text-delta" && datos) {
          held += part.text;
          return;
        }
        if (part.type === "finish" && !done && datos) emit(controller);
        controller.enqueue(part);
      },
      // Si el flujo se corta sin «finish», la respuesta sale igual.
      flush(controller) {
        if (!done && datos) emit(controller);
      },
    });
  };
}
