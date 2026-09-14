"use client";

import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { Models } from "@/constants";
import { CONVERSATION_STATUS_LABELS, type ConversationRow } from "@/lib/conversations";
import { ConversationStatus } from "@prisma/client";
import { Bot } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { columns } from "./columns";

interface ConversationClientProps {
  data: ConversationRow[];
}

const ConversationClient: React.FC<ConversationClientProps> = ({ data }) => {
  const router = useRouter();
  const params = useParams();
  const storeId = String(params.storeId);
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
      <Separator />
      <DataTable
        tableKey={Models.Conversations}
        searchKey="contactName"
        searchPlaceholder="Buscar por nombre, teléfono o mensaje…"
        columns={columns}
        data={data}
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
        emptyState={{
          title: "Todavía no hay conversaciones",
          description:
            "Cuando alguien escriba al WhatsApp de la tienda, la conversación aparecerá aquí sola.",
        }}
      />
    </>
  );
};

export default ConversationClient;
