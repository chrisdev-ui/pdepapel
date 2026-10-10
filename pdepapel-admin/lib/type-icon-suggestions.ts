import { z } from "zod";

import { ICON_SVG_MAX_LENGTH } from "@/lib/svg-icon";

export const ICON_SUGGESTIONS_MAX_PROPOSALS = 3;

/** Lo que devuelve la IA al proponer iconos; el SVG se sanea después con `sanitizeIconSvg`. */
export const iconSuggestionsOutputSchema = z.object({
  proposals: z
    .array(
      z.object({
        description: z.string().max(120),
        svg: z.string().max(ICON_SVG_MAX_LENGTH),
      }),
    )
    .min(1)
    .max(ICON_SUGGESTIONS_MAX_PROPOSALS),
});
