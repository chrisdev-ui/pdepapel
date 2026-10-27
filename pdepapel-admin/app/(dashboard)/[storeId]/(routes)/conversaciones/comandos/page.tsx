import type { Metadata } from "next";
import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { Heading } from "@/components/ui/heading";
import { getCommands, type CommandRow } from "./server/get-commands";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Comandos | PdePapel Admin",
  description: "Comandos escritos en el chat de WhatsApp contigo misma",
};

const STATUS: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  DONE: { label: "Respondido", variant: "secondary" },
  RECEIVED: { label: "En cola", variant: "outline" },
  RUNNING: { label: "En curso", variant: "outline" },
  STALE: { label: "Llegó tarde", variant: "outline" },
  RATE_LIMITED: { label: "Demasiados seguidos", variant: "destructive" },
  FAILED: { label: "Falló", variant: "destructive" },
};

const when = new Intl.DateTimeFormat("es-CO", {
  timeZone: "America/Bogota",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

function CommandCard({ row, storeId }: { row: CommandRow; storeId: string }) {
  const status = STATUS[row.status] ?? { label: row.status, variant: "outline" as const };
  return (
    <li className="rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="break-all font-mono text-sm font-semibold">
          /{row.command}
          {row.args ? ` ${row.args}` : ""}
        </p>
        <div className="flex items-center gap-2">
          <Badge variant={status.variant}>{status.label}</Badge>
          <time className="text-xs text-muted-foreground" dateTime={row.sentAt.toISOString()}>
            {when.format(row.sentAt)}
          </time>
        </div>
      </div>
      {row.reply ? <p className="mt-2 whitespace-pre-line break-words text-sm">{row.reply}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{row.delivered > 0 ? `Aviso en ${row.delivered} ${row.delivered === 1 ? "aparato" : "aparatos"}` : "Sin aviso push"}</span>
        {row.orderId ? (
          <Link className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline sm:min-h-0" href={`/${storeId}/pedidos/${row.orderId}`}>
            Ver pedido
          </Link>
        ) : null}
      </div>
    </li>
  );
}

export default async function CommandsPage({ params }: { params: { storeId: string } }) {
  const rows = await getCommands(params.storeId);
  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 sm:p-8 sm:pt-6">
        <Heading
          title="Comandos por WhatsApp"
          description="Lo que escribes con «/» en tu chat contigo misma y la respuesta que llegó como aviso. Escribe /ayuda para ver la lista."
        />
        {rows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            Todavía no hay comandos. Abre tu chat contigo misma en WhatsApp Business y escribe /ayuda.
          </p>
        ) : (
          <ul className="space-y-3">
            {rows.map((row) => (
              <CommandCard key={row.id} row={row} storeId={params.storeId} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
