"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import axios from "axios";
import { Loader2, MessageSquarePlus, RotateCcw, Send, Sparkles, Square, ThumbsDown, ThumbsUp } from "lucide-react";
import Link from "next/link";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { BoldText } from "./bold-text";
import { suggestionsFor, TOOL_LABELS } from "./suggestions";

export interface ConversationSummary {
  id: string;
  title: string;
  lastMessageAt: string;
}

type Mode = "rapido" | "a_fondo";

interface CopilotChatProps {
  storeId: string;
  screen: string | null;
  conversations: ConversationSummary[];
}

const newId = () => crypto.randomUUID();

/** «[conocimiento: id]» se vuelve un enlace a la nota que Paula aprobó. */
function TextWithCitations({ text, storeId }: { text: string; storeId: string }) {
  const pieces = text.split(/(\[conocimiento:\s*[a-z0-9-]+\])/gi);
  return (
    <>
      {pieces.map((piece, index) => {
        const match = /^\[conocimiento:\s*([a-z0-9-]+)\]$/i.exec(piece);
        if (!match) return <BoldText key={index} text={piece} />;
        return (
          <Link
            key={index}
            href={`/${storeId}/copiloto/conocimiento#${match[1]}`}
            className="mx-0.5 rounded bg-tint-lavender px-1.5 py-0.5 text-xs font-medium text-primary underline-offset-2 hover:underline"
          >
            nota: {match[1]}
          </Link>
        );
      })}
    </>
  );
}

type ToolPart = { type: string; state?: string; output?: { fuente?: string; rango?: string | null; actualizadoEl?: string } };

function ToolLine({ part }: { part: ToolPart }) {
  const name = part.type.replace(/^tool-/, "");
  const label = TOOL_LABELS[name] ?? "Consultando";
  if (part.state === "output-available") {
    const range = part.output?.rango ? ` · ${part.output.rango}` : "";
    return <p className="text-xs text-muted-foreground">Datos: {label.replace(/^\w+ndo /, "").toLowerCase()}{range}</p>;
  }
  if (part.state === "output-error") return <p className="text-xs text-destructive">No pude consultar: {label.toLowerCase()}.</p>;
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
      {label}…
    </p>
  );
}

export function CopilotChat({ storeId, screen, conversations: initialConversations }: CopilotChatProps) {
  const [conversationId, setConversationId] = useState<string>(newId);
  const [conversations, setConversations] = useState(initialConversations);
  const [mode, setMode] = useState<Mode>("rapido");
  const [input, setInput] = useState("");
  const [rated, setRated] = useState<Record<string, "up" | "down">>({});
  const settings = useRef({ mode, screen });
  settings.current = { mode, screen };
  const bottom = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `/api/${storeId}/copiloto/chat`,
        prepareSendMessagesRequest: ({ messages, id }) => ({
          body: { id, message: messages[messages.length - 1], mode: settings.current.mode, screen: settings.current.screen },
        }),
      }),
    [storeId],
  );
  const { messages, sendMessage, status, stop, regenerate, error, setMessages } = useChat({ id: conversationId, transport });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, status]);

  const send = (text: string) => {
    const value = text.trim();
    if (!value || busy) return;
    sendMessage({ text: value });
    setInput("");
    if (!conversations.some((conversation) => conversation.id === conversationId)) {
      setConversations((current) => [{ id: conversationId, title: value.slice(0, 120), lastMessageAt: new Date().toISOString() }, ...current]);
    }
  };

  const open = async (id: string) => {
    if (busy) return;
    const { data } = await axios.get(`/api/${storeId}/copiloto/conversaciones/${id}`);
    setConversationId(id);
    setMessages((data.messages as UIMessage[]).map((message) => ({ id: message.id, role: message.role, parts: message.parts })));
  };

  const rate = async (messageId: string, value: "up" | "down") => {
    setRated((current) => ({ ...current, [messageId]: value }));
    await axios.post(`/api/${storeId}/copiloto/mensajes/${messageId}/valoracion`, { value }).catch(() => undefined);
  };

  const lastAssistant = [...messages].reverse().find((message) => message.role === "assistant");

  return (
    // Alto: la pantalla menos la barra superior, la miga y el título; en el
    // teléfono, también la barra inferior. Así la caja de la pregunta siempre
    // se ve sin desplazar la página.
    <div className="flex h-[calc(100dvh-17rem)] min-h-[340px] flex-col gap-2 lg:h-[calc(100dvh-14.5rem)] lg:flex-row lg:gap-3">
      <aside className="flex shrink-0 flex-row gap-2 lg:w-60 lg:flex-col">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (busy) return;
            setConversationId(newId());
            setMessages([]);
          }}
          className="shrink-0 justify-start"
          aria-label="Nueva conversación"
        >
          <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Nueva conversación</span>
          <span className="sm:hidden">Nueva</span>
        </Button>
        {conversations.length > 0 && (
          <>
            <label htmlFor="copiloto-historial" className="sr-only">
              Conversaciones anteriores
            </label>
            <select
              id="copiloto-historial"
              className="h-10 min-w-0 flex-1 rounded-md border bg-white px-2 text-sm lg:hidden"
              value={conversations.some((c) => c.id === conversationId) ? conversationId : ""}
              onChange={(event) => event.target.value && open(event.target.value)}
            >
              <option value="">Conversaciones anteriores</option>
              {conversations.map((conversation) => (
                <option key={conversation.id} value={conversation.id}>
                  {conversation.title}
                </option>
              ))}
            </select>
            <ul className="hidden min-h-0 flex-1 flex-col gap-1 overflow-y-auto lg:flex">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    onClick={() => open(conversation.id)}
                    className={cn(
                      "w-full truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                      conversation.id === conversationId && "bg-accent font-medium",
                    )}
                  >
                    {conversation.title}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>

      <section className="flex min-h-0 min-w-0 flex-1 flex-col rounded-xl border bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-primary">
            <Sparkles className="h-4 w-4" aria-hidden="true" />
            Copiloto
          </p>
          <div role="radiogroup" aria-label="Tipo de respuesta" className="flex rounded-full border p-0.5 text-xs">
            {(["rapido", "a_fondo"] as const).map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={mode === value}
                onClick={() => setMode(value)}
                className={cn("rounded-full px-3 py-1", mode === value ? "bg-primary text-primary-foreground" : "text-primary")}
              >
                {value === "rapido" ? "Rápido" : "Análisis a fondo"}
              </button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-live="polite">
          {messages.length === 0 && (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-muted-foreground">
                Pregúntame por tus ventas, el inventario, Mercado Libre o dudas del oficio (marcadores, papeles, técnicas). Te digo de dónde
                salen los datos.
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestionsFor(screen).map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => send(suggestion)}
                    className="rounded-full border bg-tint-pink px-3 py-1.5 text-left text-sm text-primary hover:bg-accent"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((message) => (
            <article
              key={message.id}
              className={cn(
                "max-w-[92%] rounded-2xl px-3 py-2 text-sm leading-relaxed",
                message.role === "user" ? "ml-auto bg-primary text-primary-foreground" : "bg-muted/50 text-foreground",
              )}
            >
              {message.parts.map((part, index) => {
                if (part.type === "text") {
                  return (
                    <p key={index} className="whitespace-pre-wrap break-words">
                      {message.role === "assistant" ? <TextWithCitations text={part.text} storeId={storeId} /> : part.text}
                    </p>
                  );
                }
                if (part.type.startsWith("tool-")) return <ToolLine key={index} part={part as ToolPart} />;
                return null;
              })}
              {message.role === "assistant" && message.id === lastAssistant?.id && !busy && (
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  <button type="button" onClick={() => send("Ver más")} className="rounded-full border px-2.5 py-0.5 text-xs text-primary hover:bg-accent">
                    Ver más
                  </button>
                  <button
                    type="button"
                    aria-label="Buena respuesta"
                    aria-pressed={rated[message.id] === "up"}
                    onClick={() => rate(message.id, "up")}
                    className={cn("rounded-full p-1 hover:bg-accent", rated[message.id] === "up" && "text-success")}
                  >
                    <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    aria-label="Mala respuesta"
                    aria-pressed={rated[message.id] === "down"}
                    onClick={() => rate(message.id, "down")}
                    className={cn("rounded-full p-1 hover:bg-accent", rated[message.id] === "down" && "text-destructive")}
                  >
                    <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}
            </article>
          ))}
          {status === "submitted" && (
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
              Pensando…
            </p>
          )}
          {error && (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <span>{readableError(error)}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => regenerate()}>
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                Reintentar
              </Button>
            </div>
          )}
          <div ref={bottom} />
        </div>

        <form
          className="flex items-end gap-2 border-t p-2"
          onSubmit={(event) => {
            event.preventDefault();
            send(input);
          }}
        >
          <label htmlFor="copiloto-pregunta" className="sr-only">
            Tu pregunta
          </label>
          <Textarea
            id="copiloto-pregunta"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                send(input);
              }
            }}
            rows={1}
            maxLength={2000}
            placeholder="Escribe tu pregunta…"
            className="max-h-32 min-h-[44px] flex-1 resize-none"
          />
          {busy ? (
            <Button type="button" variant="outline" onClick={() => stop()} aria-label="Detener">
              <Square className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Detener</span>
            </Button>
          ) : (
            <Button type="submit" disabled={!input.trim()} aria-label="Enviar">
              <Send className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Enviar</span>
            </Button>
          )}
        </form>
      </section>
    </div>
  );
}

function readableError(error: Error): string {
  try {
    const parsed = JSON.parse(error.message) as { error?: string };
    if (parsed.error) return parsed.error;
  } catch {
    // no era JSON: se usa el mensaje genérico
  }
  return "No pude responder. Intenta de nuevo.";
}
