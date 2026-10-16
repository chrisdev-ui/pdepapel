import type { StreamTextTransform, TextStreamPart, ToolSet } from "ai";

import { composeKitsAnswer, type KitsAnswerData } from "@/lib/copiloto/skills/kits-answer";

/** Lo que el modelo escribe al empezar cada kit; el chat arma el bloque del kit con la herramienta. */
export const kitMarker = (index: number) => `[[KIT-${index + 1}]]`;

/**
 * Cuando corre `kitsParaRotar`, la respuesta la arma el código
 * (lib/copiloto/skills/kits-answer.ts): el texto que el modelo escribe después
 * de la herramienta se guarda y, al terminar, de él solo se toman el nombre
 * corto y el texto para la ficha de cada kit. Por eso una respuesta de kits no
 * llega de a poco: sale entera al final, sin otra llamada al modelo.
 */
export function kitsAnswerTransform<TOOLS extends ToolSet>(): StreamTextTransform<TOOLS> {
  return () => {
    let held = "";
    let datos: KitsAnswerData | null = null;
    let done = false;
    const emit = (controller: TransformStreamDefaultController<TextStreamPart<TOOLS>>) => {
      done = true;
      const text = composeKitsAnswer(datos!, held);
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
          }
        }
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
