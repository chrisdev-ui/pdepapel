import { Rocket, Snail } from "lucide-react";
import Link from "next/link";

import type { RecentEarlyAlert } from "@/lib/social/early-alert";
import { earlyAlertCopy } from "@/lib/social/early-alert-rules";

/** Tarjeta de Inicio (solo la dueña): las alertas tempranas de las últimas 24 h. */
export function SocialEarlyAlerts({ storeId, alerts }: { storeId: string; alerts: RecentEarlyAlert[] }) {
  if (alerts.length === 0) return null;
  return (
    <section aria-labelledby="alertas-redes" className="flex flex-col gap-2 rounded-xl border bg-white p-4 text-sm text-primary shadow-sm">
      <h2 id="alertas-redes" className="font-semibold">
        Redes: cómo van las publicaciones de hoy
      </h2>
      <ul className="flex flex-col gap-2">
        {alerts.map((alert) => {
          const copy = earlyAlertCopy(alert);
          const Icon = alert.kind === "DESPEGANDO" ? Rocket : Snail;
          return (
            <li key={alert.id} className="flex gap-2">
              <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="min-w-0">
                <span className="font-semibold">{copy.title}</span>
                {alert.caption && <span className="text-muted-foreground"> · «{alert.caption}»</span>}
                <span className="block">
                  {copy.summary} {copy.action}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
      <Link href={`/${storeId}/redes`} className="inline-flex min-h-[44px] items-center self-start font-semibold underline underline-offset-4">
        Ir a Métricas de redes
      </Link>
    </section>
  );
}
