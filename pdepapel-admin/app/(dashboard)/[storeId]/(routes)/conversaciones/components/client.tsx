"use client";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { Models } from "@/constants";
import { CONVERSATION_STATUS_LABELS, type ConversationRow } from "@/lib/conversations";
import { ConversationStatus } from "@prisma/client";
import { cn } from "@/lib/utils";
import { Bot, Hourglass } from "lucide-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo } from "react";
import { columns } from "./columns";

interface ConversationClientProps {
  data: ConversationRow[];
}

const ConversationClient: React.FC<ConversationClientProps> = ({ data }) => {
  const router = useRouter();
  const params = useParams();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const storeId = String(params.storeId);
  // «Esperando a Paula» va en la dirección: el correo de recordatorio enlaza aquí.
  const onlyWaiting = searchParams.get("esperando") === "1";
  const waiting = data.filter((row) => row.waitingSince).length;
  const rows = useMemo(() => (onlyWaiting ? data.filter((row) => row.waitingSince) : data), [data, onlyWaiting]);
  const toggleWaiting = () => router.replace(onlyWaiting ? pathname : `${pathname}?esperando=1`, { scroll: false });
  const needsOwner = data.filter(
    (row) => row.status === ConversationStatus.NEEDS_OWNER,
  ).length;

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Heading
          title={`Conversaciones (${data.length})`}
        description={
          needsOwner > 0
                ? `${needsOwner} ${needsOwner === 1 ? "espera tu respuesta" : "esperan tu respuesta"}. Contesta desde tu celular como siempre; aquí queda el historial.`
              : "Historial de WhatsApp. Contesta desde tu celular como siempre; aquí queda todo guardado."
          }
        />
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.push(`/${storeId}/conversaciones/respuestas`)}
        >
          <Bot className="mr-2 h-4 w-4" /> Respuestas automáticas
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          variant={onlyWaiting ? "default" : "outline"}
          aria-pressed={onlyWaiting}
          className={cn("rounded-full", !onlyWaiting && waiting > 0 && "border-destructive/40 text-destructive")}
          onClick={toggleWaiting}
        >
          <Hourglass className="mr-2 h-4 w-4" aria-hidden="true" />
          Esperando a Paula ({waiting})
        </Button>
        <span className="text-xs text-muted-foreground">La clienta escribió de último y nadie le responde hace 15 min o más.</span>
      </div>
      <Separator />
      <DataTable
        tableKey={Models.Conversations}
        searchKey="contactName"
        searchPlaceholder="Buscar por nombre, teléfono o mensaje…"
        columns={columns}
        data={rows}
        onRowClick={(row) => router.push(`/${storeId}/conversaciones/${row.id}`)}
        filters={[
          {
            columnKey: "status",
            title: "Estado",
            options: Object.values(ConversationStatus).map((status) => ({
              label: CONVERSATION_STATUS_LABELS[status],
              value: status,
            })),
          },
        ]}
        emptyState={onlyWaiting ? {
          title: "Nadie te está esperando",
          description: "Cuando una clienta escriba y pasen 15 minutos sin respuesta, aparecerá aquí.",
        } : {
          title: "Todavía no hay conversaciones",
          description:
            "Cuando alguien escriba al WhatsApp de la tienda, la conversación aparecerá aquí sola.",
        }}
      />
    </>
  );
};

export default ConversationClient;
