import { CheckCircle2, ChevronRight, MessageCircle } from "lucide-react";
import Link from "next/link";

import type { WaitingAlertSummary } from "@/lib/whatsapp/waiting-alert";
import { formatWaitingAgo } from "@/lib/whatsapp/waiting";

const VISIBLE = 8;

interface WaitingCustomersProps {
  storeId: string;
  summary: WaitingAlertSummary;
  now: Date;
}

/** Solo el enlace y cuánto lleva: ni nombre, ni teléfono, ni texto de la clienta. */
export function WaitingCustomers({ storeId, summary, now }: WaitingCustomersProps) {
  const visible = summary.items.slice(0, VISIBLE);
  return (
    <section aria-labelledby="clientas-esperando" className="flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-tint-cream text-primary">
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
          </span>
          <h2 id="clientas-esperando" className="text-[15px] font-bold text-primary">
            Clientas esperando
          </h2>
          {summary.count > 0 && <span className="rounded-full bg-tint-pink px-2 py-0.5 text-xs font-bold text-primary">{summary.count}</span>}
        </div>
        <Link
          href={`/${storeId}/conversaciones?esperando=1`}
          className="inline-flex min-h-11 items-center text-[13px] font-semibold text-primary hover:underline"
        >
          Ver en Conversaciones
        </Link>
      </div>
      {summary.count === 0 ? (
        <div className="flex items-center gap-3 border-t px-4 py-4">
          <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          <p className="text-sm text-muted-foreground">Ninguna clienta lleva {summary.minutes} min o más sin respuesta.</p>
        </div>
      ) : (
        <>
          <p className="border-t px-4 pt-3 text-xs text-muted-foreground">Sin respuesta hace {summary.minutes} min o más, de la que más lleva a la que menos.</p>
          <ul className="flex flex-col py-1">
            {visible.map((item) => (
              <li key={item.conversationId}>
                <Link
                  href={`/${storeId}/conversaciones/${item.conversationId}`}
                  className="flex min-h-11 items-center gap-3 px-4 py-2 text-sm hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                >
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-semibold text-primary">Conversación</span>
                    <span className="text-muted-foreground"> · {formatWaitingAgo(item.since, now)}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
          {summary.count > visible.length && (
            <p className="border-t px-4 py-2.5 text-xs text-muted-foreground">Y {summary.count - visible.length} más en Conversaciones.</p>
          )}
        </>
      )}
    </section>
  );
}
