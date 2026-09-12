import { TintBadge } from "@/components/ui/tint-badge";
import { RESTOCK_STATUS_LABELS, RESTOCK_STEPS } from "@/lib/restock-orders";
import { cn } from "@/lib/utils";
import { RestockOrderStatus } from "@prisma/client";
import { Check } from "lucide-react";

/** Posición de cada estado en el indicador; recibido en parte comparte el paso «Recibiendo». */
const STEP_INDEX: Record<RestockOrderStatus, number> = {
  DRAFT: 0,
  ORDERED: 2,
  PARTIALLY_RECEIVED: 2,
  COMPLETED: 3,
  CANCELLED: -1,
};

export function RestockSteps({ status, receivedUnits }: { status: RestockOrderStatus; receivedUnits: number }) {
  const current = STEP_INDEX[status];
  const cancelled = status === RestockOrderStatus.CANCELLED;
  return (
    <ol aria-label="Estado del pedido" className="flex flex-wrap items-center gap-x-2 gap-y-3 rounded-xl border bg-white p-4">
      {RESTOCK_STEPS.map((step, index) => {
        const done = !cancelled && (index < current || status === RestockOrderStatus.COMPLETED);
        const now = !cancelled && index === current && status !== RestockOrderStatus.COMPLETED;
        return (
          <li key={step.status} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                done && "bg-tint-mint text-primary",
                now && "bg-primary text-primary-foreground",
                !done && !now && "bg-muted text-muted-foreground",
              )}
              aria-hidden="true"
            >
              {done ? <Check className="h-3.5 w-3.5" /> : index + 1}
            </span>
            <span className={cn("text-[13px] font-semibold", done || now ? "text-primary" : "text-muted-foreground")}>
              {step.label}
              <span className="sr-only">{done ? " (hecho)" : now ? " (en curso)" : ""}</span>
            </span>
            {index < RESTOCK_STEPS.length - 1 && <span className={cn("hidden h-0.5 w-8 sm:block", done ? "bg-tint-mint" : "bg-border")} aria-hidden="true" />}
          </li>
        );
      })}
      {cancelled ? (
        <li className="ml-auto">
          <TintBadge label={RESTOCK_STATUS_LABELS.CANCELLED} tone="pink" />
        </li>
      ) : (
        <li className="basis-full text-xs text-muted-foreground sm:ml-auto sm:basis-auto">
          {receivedUnits > 0 ? "Con mercancía recibida ya no se puede cancelar." : "Solo se puede cancelar mientras no haya nada recibido."}
        </li>
      )}
    </ol>
  );
}
