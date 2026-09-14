"use client";

import axios from "axios";
import {
  AlertTriangle,
  ArrowRight,
  Loader2,
  MessagesSquare,
  PenLine,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import type { SanitizedProposal } from "@/lib/whatsapp/bot-reply-assistant";

interface AssistantResponse {
  proposals: SanitizedProposal[];
  note: string | null;
  remainingToday: number;
  reused: boolean;
  analyzedMessages: number;
}

type Mode = "conversations" | "topic";

/**
 * Asistente de la pantalla de respuestas.
 *
 * Resuelve el problema de la hoja en blanco: en vez de adivinar qué preguntan
 * las clientas y con qué palabras, lee los mensajes que el bot dejó pasar y
 * propone respuestas ya escritas. Nada se guarda aquí: cada propuesta abre el
 * formulario de siempre con los campos llenos, para revisar y confirmar.
 */
export function BotReplyAssistant({ storeId }: { storeId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [running, setRunning] = useState<Mode | null>(null);
  const [topic, setTopic] = useState("");
  const [result, setResult] = useState<AssistantResponse | null>(null);

  const run = async (mode: Mode) => {
    if (mode === "topic" && !topic.trim()) return;

    try {
      setRunning(mode);
      const { data } = await axios.post<AssistantResponse>(
        `/api/${storeId}/bot-replies/assistant`,
        mode === "topic" ? { mode, topic: topic.trim() } : { mode },
      );
      setResult(data);

      if (data.proposals.length === 0 && !data.note) {
        toast({
          title: "No se encontró nada que proponer",
          description: "Intenta describiendo el tema con tus palabras.",
          variant: "warning",
        });
      }
    } catch (error) {
      toast({
        title: "El asistente no pudo responder",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setRunning(null);
    }
  };

  const openProposalInForm = (proposal: SanitizedProposal) => {
    const query = new URLSearchParams({
      label: proposal.label,
      triggers: proposal.triggers.join("\n"),
      answer: proposal.answer,
    });
    router.push(
      `/${storeId}/conversaciones/respuestas/nueva?${query.toString()}`,
    );
  };

  return (
    <Card className="border-dashed">
      <CardContent className="space-y-4 p-4">
        <div className="space-y-1">
          <p className="flex items-center gap-2 font-medium">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            ¿No sabes qué respuestas crear?
          </p>
          <p className="text-sm text-muted-foreground">
            Reviso los mensajes que te escribieron y que el bot no supo
            contestar, y te propongo respuestas ya redactadas. Tú las revisas y
            decides cuáles guardar: aquí no se guarda nada solo.
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <Button
            type="button"
            onClick={() => run("conversations")}
            disabled={running !== null}
            className="sm:w-auto"
          >
            {running === "conversations" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <MessagesSquare className="mr-2 h-4 w-4" aria-hidden="true" />
            )}
            Mirar lo que me preguntan
          </Button>

          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor="bot-assistant-topic" className="text-xs font-normal">
              O dime de qué quieres una respuesta
            </Label>
            <div className="flex gap-2">
              <Input
                id="bot-assistant-topic"
                value={topic}
                onChange={(event) => setTopic(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void run("topic");
                  }
                }}
                placeholder="Cómo pagar por transferencia"
                maxLength={300}
                disabled={running !== null}
                autoComplete="off"
              />
              <Button
                type="button"
                variant="soft"
                onClick={() => run("topic")}
                disabled={running !== null || !topic.trim()}
              >
                {running === "topic" ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <PenLine className="h-4 w-4" aria-hidden="true" />
                )}
                <span className="sr-only">Redactar sobre este tema</span>
              </Button>
            </div>
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          Antes de analizarlos, a los mensajes se les quitan los teléfonos y
          correos: solo se mira la pregunta.
        </p>

        {result ? (
          <div className="space-y-3 border-t pt-4">
            <p className="text-xs text-muted-foreground">
              {result.analyzedMessages > 0
                ? `Revisé ${result.analyzedMessages} mensaje${result.analyzedMessages === 1 ? "" : "s"} sin contestar.`
                : null}{" "}
              {result.reused
                ? "Se reutilizó el análisis anterior, no gastó una consulta."
                : null}{" "}
              Te quedan {result.remainingToday} consultas hoy.
            </p>

            {result.note ? (
              <p className="text-sm text-muted-foreground">{result.note}</p>
            ) : null}

            {result.proposals.map((proposal, index) => (
              <div
                key={`${proposal.label}-${index}`}
                className="space-y-3 rounded-lg border bg-muted/30 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <p className="font-medium">{proposal.label}</p>
                    <p className="text-sm text-muted-foreground">
                      {proposal.reason}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openProposalInForm(proposal)}
                  >
                    Revisar y crear
                    <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                  </Button>
                </div>

                <p className="flex flex-wrap gap-1">
                  {proposal.triggers.map((trigger) => (
                    <Badge key={trigger} variant="outline" className="font-normal">
                      {trigger}
                    </Badge>
                  ))}
                </p>

                <div className="whitespace-pre-wrap rounded-md border bg-background p-3 text-sm">
                  {proposal.answer}
                </div>

                {proposal.needsReview ? (
                  <p className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400">
                    <AlertTriangle
                      className="mt-0.5 h-3.5 w-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    Esta respuesta menciona datos que yo no puedo saber
                    (horarios, precios, plazos). Revísalos antes de activarla;
                    si ves algo entre corchetes, cámbialo por lo tuyo.
                  </p>
                ) : null}

                {proposal.examples.length > 0 ? (
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground">
                      Mensajes reales que habría contestado
                    </p>
                    <ul className="space-y-0.5">
                      {proposal.examples.map((example, exampleIndex) => (
                        <li
                          key={exampleIndex}
                          className="truncate text-xs text-muted-foreground"
                        >
                          «{example}»
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {proposal.droppedTriggers.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Quité {proposal.droppedTriggers.length} frase
                    {proposal.droppedTriggers.length === 1 ? "" : "s"} porque
                    otra respuesta ya se las queda o eran demasiado generales.
                  </p>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
