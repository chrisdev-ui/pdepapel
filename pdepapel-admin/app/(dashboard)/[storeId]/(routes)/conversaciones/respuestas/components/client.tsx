"use client";

import axios from "axios";
import { ArrowLeft, ChevronRight, Pencil, Plus, ShieldAlert, Trash } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Heading } from "@/components/ui/heading";
import { Separator } from "@/components/ui/separator";
import { useActionConfirmation } from "@/hooks/use-action-confirmation";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import {
  TALK_TO_OWNER_BUTTON_TITLE,
  type BotReplyRow,
} from "@/lib/whatsapp/bot-replies";
import { BotReplyAssistant } from "./assistant";
import { BotReplyTester } from "./tester";

interface BotRepliesClientProps {
  data: BotReplyRow[];
}

const BotRepliesClient: React.FC<BotRepliesClientProps> = ({ data }) => {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const { requestConfirmation, confirmationDialog } = useActionConfirmation();
  const [loading, setLoading] = useState(false);
  const storeId = String(params.storeId);
  const active = data.filter((reply) => reply.isActive).length;
  // Un menú sin aprobar no se manda: es lo primero que ella debe ver.
  const pending = data.filter(
    (reply) => reply.buttons.length > 0 && !reply.approvedAt,
  ).length;
  const labels = new Map(data.map((reply) => [reply.id, reply.label]));

  const onDelete = async (reply: BotReplyRow) => {
    const confirmed = await requestConfirmation({
      title: `¿Borrar «${reply.label}»?`,
      description:
        "El bot dejará de contestar con este mensaje. Si solo quieres pausarla, apágala en vez de borrarla.",
      confirmLabel: "Borrar",
    });
    if (!confirmed) return;

    try {
      setLoading(true);
      await axios.delete(`/api/${storeId}/bot-replies/${reply.id}`);
      router.refresh();
      toast({ title: "Respuesta borrada", variant: "success" });
    } catch (error) {
      toast({
        title: "No se pudo borrar",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {confirmationDialog}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Heading
          title={`Respuestas automáticas (${active} activa${active === 1 ? "" : "s"})`}
          description="Lo que el bot contesta solo cuando alguien escribe una de estas frases. Si no coincide ninguna, no contesta nada y te deja la conversación marcada."
        />
        <div className="flex flex-wrap gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push(`/${storeId}/conversaciones`)}
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Conversaciones
          </Button>
          <Button
            size="sm"
            onClick={() => router.push(`/${storeId}/conversaciones/respuestas/nueva`)}
          >
            <Plus className="mr-2 h-4 w-4" /> Nueva respuesta
          </Button>
        </div>
      </div>
      <Separator />

      {pending > 0 ? (
        <Card className="border-amber-500/50">
          <CardContent className="flex items-start gap-2 p-4 text-sm">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
            <p>
              <span className="font-medium">
                {pending === 1
                  ? "Hay un menú esperando tu aprobación."
                  : `Hay ${pending} menús esperando tu aprobación.`}
              </span>{" "}
              Mientras tanto el bot no los manda. Ábrelos y dale «Aprobar menú»
              cuando estés de acuerdo con lo que dicen.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <BotReplyAssistant storeId={storeId} />

      <BotReplyTester replies={data} />

      {data.length === 0 ? (
        <Card>
          <CardContent className="space-y-2 p-6 text-sm text-muted-foreground">
            <p className="font-medium text-foreground">
              Todavía no hay respuestas automáticas.
            </p>
            <p>
              Mientras esta lista esté vacía, el bot no contesta nada: cada
              mensaje que llega te queda marcado para que respondas tú desde el
              celular, como hasta ahora.
            </p>
            <p>
              Crea la primera con «Nueva respuesta». Una buena para empezar es
              el horario.
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="space-y-3">
          {data.map((reply, index) => (
            <li key={reply.id}>
              <Card className={reply.isActive ? undefined : "opacity-60"}>
                <CardContent className="flex flex-wrap items-start justify-between gap-4 p-4">
                  <div className="min-w-0 space-y-2">
                    <p className="flex flex-wrap items-center gap-2 font-medium">
                      <span className="text-xs text-muted-foreground">
                        {index + 1}.
                      </span>
                      {reply.label}
                      <Badge variant={reply.isActive ? "default" : "secondary"}>
                        {reply.isActive ? "Activa" : "Apagada"}
                      </Badge>
                      {reply.buttons.length > 0 ? (
                        <Badge variant={reply.approvedAt ? "success" : "warning"}>
                          {reply.approvedAt ? "Menú aprobado" : "Sin aprobar"}
                        </Badge>
                      ) : null}
                    </p>
                    <p className="flex flex-wrap gap-1">
                      {reply.triggers.map((trigger) => (
                        <Badge key={trigger} variant="outline" className="font-normal">
                          {trigger}
                        </Badge>
                      ))}
                    </p>
                    <p className="max-w-prose whitespace-pre-wrap text-sm text-muted-foreground">
                      {reply.answer}
                    </p>
                    <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {reply.buttons.map((button) => (
                        <span key={button.targetReplyId} className="inline-flex items-center gap-1">
                          <span className="rounded border px-1.5 py-0.5 font-medium text-foreground">
                            {button.title}
                          </span>
                          <ChevronRight className="h-3 w-3" aria-hidden="true" />
                          {labels.get(button.targetReplyId) ?? "respuesta borrada"}
                        </span>
                      ))}
                      <span className="inline-flex items-center gap-1 opacity-70">
                        <span className="rounded border px-1.5 py-0.5">
                          {TALK_TO_OWNER_BUTTON_TITLE}
                        </span>
                        <ChevronRight className="h-3 w-3" aria-hidden="true" />
                        siempre, lo pone el sistema
                      </span>
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loading}
                      onClick={() =>
                        router.push(`/${storeId}/conversaciones/respuestas/${reply.id}`)
                      }
                    >
                      <Pencil className="mr-2 h-4 w-4" /> Editar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      disabled={loading}
                      onClick={() => onDelete(reply)}
                    >
                      <Trash className="h-4 w-4" />
                      <span className="sr-only">Borrar</span>
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {data.length > 1 ? (
        <p className="text-xs text-muted-foreground">
          Si un mensaje coincide con varias, gana la primera de la lista. Puedes
          cambiar el orden con el número «Orden» dentro de cada respuesta.
        </p>
      ) : null}
    </>
  );
};

export default BotRepliesClient;
