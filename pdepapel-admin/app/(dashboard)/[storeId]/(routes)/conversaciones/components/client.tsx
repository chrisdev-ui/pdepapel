"use client";

import { AlertModal } from "@/components/modals/alert-modal";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { Models } from "@/constants";
import { CONVERSATION_STATUS_LABELS } from "@/lib/conversation-labels";
import type { ConversationRow } from "@/lib/conversations";
import { ConversationStatus } from "@prisma/client";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import axios from "axios";
import { Bot, CheckCheck, Hourglass } from "lucide-react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
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
  const { toast } = useToast();
  const [confirmAll, setConfirmAll] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  // Para limpiar esperas viejas de una vez: solo las que se ven en el filtro.
  const markAllAttended = async () => {
    const ids = data.filter((row) => row.waitingSince).map((row) => row.id);
    try {
      setMarkingAll(true);
      const { data: result } = await axios.post(`/api/${storeId}/conversations/attended`, { ids });
      setConfirmAll(false);
      router.refresh();
      toast({
        title: result.count === 1 ? "1 conversación atendida" : `${result.count} conversaciones atendidas`,
        description: "No se le envió nada a ninguna clienta. Si alguna vuelve a escribir, aparece otra vez.",
        variant: "success",
      });
    } catch (error) {
      toast({ title: "No se pudieron marcar como atendidas", description: getErrorMessage(error), variant: "destructive" });
    } finally {
      setMarkingAll(false);
    }
  };
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
        {onlyWaiting && waiting > 0 ? (
          <Button type="button" size="sm" variant="outline" className="min-h-11 sm:min-h-9" onClick={() => setConfirmAll(true)}>
            <CheckCheck className="mr-2 h-4 w-4" aria-hidden="true" />
            Marcar todas como atendidas ({waiting})
          </Button>
        ) : null}
        <span className="text-xs text-muted-foreground">La clienta escribió de último y nadie le responde hace 15 min o más.</span>
      </div>
      <AlertModal
        isOpen={confirmAll}
        onClose={() => setConfirmAll(false)}
        onConfirm={markAllAttended}
        loading={markingAll}
        destructive={false}
        title={waiting === 1 ? "¿Marcar 1 conversación como atendida?" : `¿Marcar ${waiting} conversaciones como atendidas?`}
        description="Salen de «Esperando a Paula» y no se le envía nada a ninguna clienta. Si alguna vuelve a escribir, aparece otra vez."
        confirmLabel="Sí, marcar como atendidas"
      />
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
