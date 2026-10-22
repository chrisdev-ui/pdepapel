import type { StreamTextTransform, TextStreamPart, ToolSet } from "ai";

import { composeKitPriceAnswer } from "@/lib/copiloto/skills/kit-price-answer";
import { KIT_PRICE_TOOL } from "@/lib/copiloto/skills/kit-price-tool";
import { composeBelowMarginAnswer, composePacksAnswer, composePriceAnswer } from "@/lib/copiloto/skills/precios-answer";
import { BELOW_MARGIN_TOOL, PACKS_TOOL, PRICE_TOOL, type BelowMarginResult, type PacksResult, type PriceResult } from "@/lib/copiloto/skills/precios-tool";

const COMPOSERS: Record<string, (output: never) => string> = {
  [PRICE_TOOL]: composePriceAnswer as (output: never) => string,
  [PACKS_TOOL]: composePacksAnswer as (output: never) => string,
  [BELOW_MARGIN_TOOL]: composeBelowMarginAnswer as (output: never) => string,
  [KIT_PRICE_TOOL]: composeKitPriceAnswer as (output: never) => string,
};

/**
 * Cuando corre una herramienta de «Precios», la respuesta la arma el código
 * con su resultado (lib/copiloto/skills/precios-answer.ts) y el texto libre
 * del modelo se descarta: así ningún monto sale de lo que escribe el modelo.
 * El chat se detiene después de esa herramienta, sin otra llamada al modelo.
 * Con la habilidad cargada (`hold`), el texto de cada paso se retiene hasta
 * saber si el paso termina en una herramienta de precios: así tampoco sale lo
 * que el modelo escribió antes de llamarla.
 */
export function pricingAnswerTransform<TOOLS extends ToolSet>({ hold = () => false }: { hold?: () => boolean } = {}): StreamTextTransform<TOOLS> {
  return () => {
    let text: string | null = null;
    let done = false;
    let pending: TextStreamPart<TOOLS>[] = [];
    const isText = (part: TextStreamPart<TOOLS>) => part.type === "text-start" || part.type === "text-end" || part.type === "text-delta";
    const release = (controller: TransformStreamDefaultController<TextStreamPart<TOOLS>>) => {
      for (const held of pending) controller.enqueue(held);
      pending = [];
    };
    const emit = (controller: TransformStreamDefaultController<TextStreamPart<TOOLS>>) => {
      done = true;
      const id = "precios-fijo";
      controller.enqueue({ type: "text-start", id } as TextStreamPart<TOOLS>);
      controller.enqueue({ type: "text-delta", id, text: text! } as TextStreamPart<TOOLS>);
      controller.enqueue({ type: "text-end", id } as TextStreamPart<TOOLS>);
    };
    return new TransformStream<TextStreamPart<TOOLS>, TextStreamPart<TOOLS>>({
      transform(part, controller) {
        if (part.type === "tool-result" && part.toolName in COMPOSERS) {
          const output = part.output as PriceResult | PacksResult | BelowMarginResult | undefined;
          if (output?.datos) text = COMPOSERS[part.toolName](output as never);
        }
        if (text !== null && isText(part)) return;
        if (hold() && isText(part)) {
          pending.push(part);
          return;
        }
        if (part.type === "tool-call" && part.toolName in COMPOSERS) pending = [];
        if (part.type === "finish-step" || part.type === "finish") release(controller);
        if (part.type === "finish" && !done && text !== null) emit(controller);
        controller.enqueue(part);
      },
      flush(controller) {
        release(controller);
        if (!done && text !== null) emit(controller);
      },
    });
  };
}
