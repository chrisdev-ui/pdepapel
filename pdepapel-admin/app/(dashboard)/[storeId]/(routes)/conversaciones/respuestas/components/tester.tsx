"use client";

import { CheckCircle2, MessageCircleQuestion, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { matchWhatsAppKeyword } from "@/lib/whatsapp/bot-matching";
import type { BotReplyRow } from "@/lib/whatsapp/bot-replies";

/**
 * Caja de prueba: la dueña escribe una frase y ve qué contestaría el bot.
 * Usa exactamente la misma función que decide en producción, así que lo que
 * muestra aquí es lo que va a pasar de verdad.
 */
export function BotReplyTester({ replies }: { replies: BotReplyRow[] }) {
  const [text, setText] = useState("");

  const result = useMemo(() => {
    if (!text.trim()) return null;
    const active = replies.filter((reply) => reply.isActive);
    return matchWhatsAppKeyword(text, active);
  }, [replies, text]);

  return (
    <Card className="bg-muted/30">
      <CardContent className="space-y-3 p-4">
        <Label htmlFor="bot-tester" className="flex items-center gap-2">
          <MessageCircleQuestion className="h-4 w-4" aria-hidden="true" />
          Pruébalo: escribe algo como si fueras una clienta
        </Label>
        <Input
          id="bot-tester"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="¿A qué hora abren hoy?"
          autoComplete="off"
        />
        {text.trim() ? (
          result ? (
            <div className="space-y-2">
              <p className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                Contestaría con «{result.keyword.label ?? "sin nombre"}», porque
                encontró «{result.trigger}».
              </p>
              <div className="whitespace-pre-wrap rounded-md border bg-background p-3 text-sm">
                {result.keyword.answer}
              </div>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <XCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              No contestaría nada. La conversación te quedaría marcada para que
              respondas tú.
            </p>
          )
        ) : null}
      </CardContent>
    </Card>
  );
}
