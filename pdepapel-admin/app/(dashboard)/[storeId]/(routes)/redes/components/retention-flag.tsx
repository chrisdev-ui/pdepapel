"use client";

import { AlertTriangle } from "lucide-react";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export const RETENTION_WARNING_TEXT = "La mayoría deja de verlo muy pronto";

/** La alerta roja de retención: con el mouse o el teclado muestra la frase y por qué; el lector de pantalla la lee siempre. */
export function RetentionFlag({ details }: { details: string[] }) {
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            role="img"
            aria-label={[`${RETENTION_WARNING_TEXT}.`, ...details].join(" ")}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-destructive focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <AlertTriangle className="h-4 w-4" aria-hidden />
          </span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs">
          <p className="font-semibold">{RETENTION_WARNING_TEXT}</p>
          {details.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
