"use client";

import axios from "axios";
import { ArrowLeft, Pencil, Plus, Trash } from "lucide-react";
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
import type { BotReplyRow } from "@/lib/whatsapp/bot-replies";
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
