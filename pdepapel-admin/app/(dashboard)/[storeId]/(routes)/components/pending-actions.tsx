import { Button } from "@/components/ui/button";
import type { TodayPendingAction } from "@/lib/dashboard-today";
import { cn } from "@/lib/utils";
import { AlertTriangle, CheckCircle2, Clock, CreditCard, ListChecks, MessageCircle, Truck } from "lucide-react";
import Link from "next/link";

const ICONS: Record<TodayPendingAction["kind"], { icon: React.ReactNode; tint: string }> = {
  "verify-payment": { icon: <CreditCard className="h-[18px] w-[18px]" aria-hidden="true" />, tint: "bg-tint-cream" },
  "create-guide": { icon: <Truck className="h-[18px] w-[18px]" aria-hidden="true" />, tint: "bg-tint-sky" },
  "answer-question": { icon: <MessageCircle className="h-[18px] w-[18px]" aria-hidden="true" />, tint: "bg-tint-lavender" },
  restock: { icon: <AlertTriangle className="h-[18px] w-[18px]" aria-hidden="true" />, tint: "bg-tint-pink" },
  "expiring-quote": { icon: <Clock className="h-[18px] w-[18px]" aria-hidden="true" />, tint: "bg-muted" },
};

interface PendingActionsProps {
  storeId: string;
  items: TodayPendingAction[];
}

export function PendingActions({ storeId, items }: PendingActionsProps) {
  return (
    <section aria-labelledby="pendientes" className="flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="flex items-center justify-between px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-tint-lavender text-primary">
            <ListChecks className="h-4 w-4" aria-hidden="true" />
          </span>
          <h2 id="pendientes" className="text-[15px] font-bold text-primary">
            Pendientes de acción
          </h2>
          {items.length > 0 && (
            <span className="rounded-full bg-tint-pink px-2 py-0.5 text-xs font-bold text-primary">{items.length}</span>
          )}
        </div>
        <Link href={`/${storeId}/pedidos?vista=por-atender`} className="text-[13px] font-semibold text-primary hover:underline">
          Ver pedidos
        </Link>
      </div>
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-2 border-t px-6 py-10 text-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-tint-mint text-primary">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
          </span>
          <p className="text-sm font-semibold">Todo al día</p>
          <p className="text-sm text-muted-foreground">No hay pagos por verificar, guías por crear ni preguntas sin responder.</p>
        </div>
      ) : (
        <ul className="divide-y border-t">
          {items.map((item, index) => {
            const style = ICONS[item.kind];
            return (
              <li key={`${item.kind}-${index}`} className="flex items-center gap-3 px-4 py-3">
                <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-primary", style.tint)}>{style.icon}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="truncate text-sm font-semibold text-primary">{item.title}</span>
                  <span className="truncate text-xs text-muted-foreground">{item.meta}</span>
                </div>
                <Button asChild size="xs" variant={item.kind === "verify-payment" ? "default" : "outline"}>
                  <Link href={item.href}>{item.action}</Link>
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
