import { AlarmClock } from "lucide-react";

import { expiryLabel, expiryUrgency } from "@/lib/reservation-labels";
import { cn } from "@/lib/utils";

/**
 * «vence hoy», «vence mañana», «vence en 3 días»… Hoy o vencida en rojo y
 * mañana en rosado con reloj, para que se vea de un vistazo; el resto discreto.
 */
export function ExpiryChip({ expiresAt, className }: { expiresAt: string | Date; className?: string }) {
  const urgency = expiryUrgency(expiresAt);
  return (
    <span
      data-testid="expiry-chip"
      data-urgency={urgency}
      className={cn(
        "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold",
        urgency === "vencida" || urgency === "hoy"
          ? "bg-destructive/15 text-destructive ring-1 ring-destructive/40"
          : urgency === "manana"
            ? "bg-tint-pink text-primary ring-1 ring-pink-400/70"
            : "bg-tint-cream text-primary",
        className,
      )}
    >
      {urgency !== "luego" && <AlarmClock className="h-3 w-3 shrink-0" aria-hidden="true" />}
      {expiryLabel(expiresAt)}
    </span>
  );
}
