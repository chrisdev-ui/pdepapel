import type { SystemStatusRow } from "@/lib/job-runs";
import { cn } from "@/lib/utils";
import { Activity } from "lucide-react";
import { TintBadge } from "../pedidos/components/order-badges";

const fmt = (value: Date) =>
  new Intl.DateTimeFormat("es-CO", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Bogota",
  }).format(value);

/**
 * Última corrida de cada tarea de fondo. Un cron muerto o una revalidación
 * que falla no se veía desde el panel: solo desde Vercel o el correo.
 */
export function SystemsStatus({ rows }: { rows: SystemStatusRow[] }) {
  const attention = rows.filter((row) => row.attention).length;
  return (
    <section
      aria-labelledby="sistemas"
      className="flex flex-col overflow-hidden rounded-xl border bg-white shadow-sm"
    >
      <div className="flex items-center justify-between px-4 py-3.5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-tint-sky text-primary">
            <Activity className="h-4 w-4" aria-hidden="true" />
          </span>
          <h2 id="sistemas" className="text-[15px] font-bold text-primary">
            Sistemas
          </h2>
        </div>
        {attention > 0 ? (
          <TintBadge label={`${attention} con atención`} tone="pink" />
        ) : (
          <TintBadge label="Al día" tone="mint" />
        )}
      </div>
      <ul className="divide-y border-t">
        {rows.map((row) => (
          <li key={row.name} className="flex items-center gap-3 px-4 py-2.5">
            <span
              className={cn(
                "h-2 w-2 shrink-0 rounded-full",
                row.attention
                  ? "bg-destructive"
                  : row.ok === null
                    ? "bg-muted-foreground/40"
                    : "bg-success",
              )}
              aria-hidden="true"
            />
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[13px] font-medium text-primary">
                {row.label}
              </span>
              <span
                className="truncate text-xs text-muted-foreground"
                title={row.detail ?? undefined}
              >
                {row.ranAt
                  ? `${row.ok ? "Corrió" : "Falló"} ${fmt(row.ranAt)}`
                  : "Sin corridas registradas"}
                {row.overdue && row.ranAt ? " · atrasada" : ""}
                {!row.ok && row.detail ? ` · ${row.detail}` : ""}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
