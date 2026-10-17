"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import axios from "axios";
import { Brain, ClipboardCopy, Loader2, MessageSquarePlus, Plus, RotateCcw, Send, Sparkles, Square, ThumbsDown, ThumbsUp, Trash2, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useActionConfirmation } from "@/hooks/use-action-confirmation";
import { toast } from "@/hooks/use-toast";
import { Textarea } from "@/components/ui/textarea";
import { descriptionBlockToHtml, descriptionBlockToPlainText, extractDescriptionBlock } from "@/lib/copiloto/description-html";
import { COPILOT_SKILL_CATALOG, COPILOT_SKILL_NAMES } from "@/lib/copiloto/skills/names";
import { cn } from "@/lib/utils";

import { AnswerView, copyRichText } from "./answer-view";
import { suggestionsFor, TOOL_LABELS } from "./suggestions";

export interface ConversationSummary {
  id: string;
  title: string;
  lastMessageAt: string;
}

type Mode = "rapido" | "a_fondo";

interface SkillState {
  loaded: string[];
  pinned: string[];
  blocked: string[];
}

interface CopilotChatProps {
  storeId: string;
  screen: string | null;
  conversations: ConversationSummary[];
}

const newId = () => crypto.randomUUID();

/** La respuesta del copiloto: el mismo componente para lo nuevo y para el historial. */
export const AssistantText = AnswerView;

type ToolPart = {
  type: string;
  state?: string;
  output?: { fuente?: string; rango?: string | null; actualizadoEl?: string; encontrado?: boolean; datos?: { sku?: string | null } };
};

/** Las habilidades que el copiloto cargó en esta conversación, en el orden en que las cargó. */
function loadedSkills(messages: UIMessage[]): string[] {
  const ids: string[] = [];
  for (const message of messages) {
    for (const part of message.parts) {
      const value = part as { type: string; state?: string; output?: { ok?: boolean; id?: string } };
      if (value.type === "tool-cargarHabilidad" && value.state === "output-available" && value.output?.ok && value.output.id && !ids.includes(value.output.id)) {
        ids.push(value.output.id);
      }
    }
  }
  return ids;
}

/** HTML de la plantilla para pegar en la ficha, con el texto plano de respaldo. */
async function copyForProductPage(text: string): Promise<boolean> {
  const block = extractDescriptionBlock(text);
  return block ? copyRichText(block) : false;
}

function ToolLine({ part }: { part: ToolPart }) {
  const name = part.type.replace(/^tool-/, "");
  // Las habilidades cargadas se ven como chips arriba, no como una línea más.
  if (name === "cargarHabilidad" && part.state === "output-available") return null;
  // Los textos de los kits son parte de la respuesta, no una fuente de datos.
  if (name === "textosDeKits" && part.state === "output-available") return null;
  // La fuente es la ficha solo si de verdad encontró el producto.
  if (name === "productoParaDescripcion" && part.state === "output-available") {
    const sku = part.output?.encontrado ? part.output.datos?.sku : null;
    return <p className="text-xs text-muted-foreground">{sku ? `Datos: la ficha del producto (SKU ${sku})` : "Datos: lo que me diste"}</p>;
  }
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
  // Los mensajes con que arranca cada conversación: `useChat` crea un chat
  // nuevo al cambiar el id, así que hay que dárselos junto con el id.
  const [seed, setSeed] = useState<UIMessage[]>([]);
  const { requestConfirmation, confirmationDialog } = useActionConfirmation();
  const [conversations, setConversations] = useState(initialConversations);
  const [mode, setMode] = useState<Mode>("rapido");
  const [input, setInput] = useState("");
  const [rated, setRated] = useState<Record<string, "up" | "down">>({});
  // Lo que dice el servidor de las habilidades de esta conversación, y las que Paula fija antes de la primera pregunta.
  const [skillState, setSkillState] = useState<SkillState | null>(null);
  const [pendingPins, setPendingPins] = useState<string[]>([]);
  const [skillsChanged, setSkillsChanged] = useState(false);
  const settings = useRef({ mode, screen, pendingPins });
  settings.current = { mode, screen, pendingPins };
  const bottom = useRef<HTMLDivElement>(null);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `/api/${storeId}/copiloto/chat`,
        prepareSendMessagesRequest: ({ messages, id, trigger }) => ({
          body: {
            id,
            message: messages[messages.length - 1],
            mode: settings.current.mode,
            screen: settings.current.screen,
            regenerar: trigger === "regenerate-message",
            habilidades: messages.length === 1 ? settings.current.pendingPins : [],
          },
        }),
      }),
    [storeId],
  );
  const { messages, sendMessage, status, stop, regenerate, error } = useChat({ id: conversationId, messages: seed, transport });
  const busy = status === "submitted" || status === "streaming";
  const lastMetadataSkills = useMemo(() => {
    const last = [...messages].reverse().find((message) => message.role === "assistant");
    return (last?.metadata as { habilidades?: SkillState } | undefined)?.habilidades ?? null;
  }, [messages]);
  useEffect(() => {
    if (lastMetadataSkills) setSkillState(lastMetadataSkills);
  }, [lastMetadataSkills]);
  const conversationStarted = messages.length > 0;
  const skills = skillState
    ? skillState.loaded
    : Array.from(new Set([...pendingPins, ...(conversationStarted ? loadedSkills(messages) : [])]));

  const changeSkill = async (action: "add" | "remove", skillId: string) => {
    if (busy) return;
    if (!conversationStarted) {
      setPendingPins((current) => (action === "add" ? Array.from(new Set([...current, skillId])) : current.filter((id) => id !== skillId)));
      return;
    }
    try {
      const { data } = await axios.post<SkillState & { modelChosen: string[] }>(`/api/${storeId}/copiloto/conversaciones/${conversationId}/habilidades`, {
        action,
        skillId,
      });
      setSkillState({ loaded: data.loaded, pinned: data.pinned, blocked: data.blocked });
      setSkillsChanged(true);
    } catch {
      toast({ description: "No se pudo cambiar la habilidad", variant: "destructive" });
    }
  };

  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length, status]);

  const send = (text: string) => {
    const value = text.trim();
    if (!value || busy) return;
    sendMessage({ text: value });
    setInput("");
    setSkillsChanged(false);
    if (!conversations.some((conversation) => conversation.id === conversationId)) {
      setConversations((current) => [{ id: conversationId, title: value.slice(0, 120), lastMessageAt: new Date().toISOString() }, ...current]);
    }
  };

  const startNew = () => {
    setSeed([]);
    setConversationId(newId());
    setSkillState(null);
    setPendingPins([]);
    setSkillsChanged(false);
  };

  const open = async (id: string) => {
    if (busy || id === conversationId) return;
    const { data } = await axios.get(`/api/${storeId}/copiloto/conversaciones/${id}`);
    setSeed((data.messages as UIMessage[]).map((message) => ({ id: message.id, role: message.role, parts: message.parts })));
    setConversationId(id);
    setSkillState(data.habilidades ?? null);
    setPendingPins([]);
    setSkillsChanged(false);
  };

  const remove = async (conversation: ConversationSummary) => {
    if (busy) return;
    const confirmed = await requestConfirmation({
      title: "¿Eliminar esta conversación?",
      description: `«${conversation.title}» se borra con todos sus mensajes. No se puede deshacer.`,
      confirmLabel: "Eliminar",
      destructive: true,
    });
    if (!confirmed) return;
    try {
      await axios.delete(`/api/${storeId}/copiloto/conversaciones/${conversation.id}`);
      setConversations((current) => current.filter((item) => item.id !== conversation.id));
      if (conversation.id === conversationId) startNew();
    } catch {
      toast({ description: "No se pudo eliminar la conversación", variant: "destructive" });
    }
  };

  const openConversation = conversations.find((conversation) => conversation.id === conversationId);

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
      {confirmationDialog}
      <aside className="flex shrink-0 flex-row gap-2 lg:w-60 lg:flex-col">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            if (busy) return;
            startNew();
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
              onChange={(event) => (event.target.value ? open(event.target.value) : startNew())}
            >
              <option value="">Conversaciones anteriores</option>
              {conversations.map((conversation) => (
                <option key={conversation.id} value={conversation.id}>
                  {conversation.title}
                </option>
              ))}
            </select>
            {openConversation && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="shrink-0 lg:hidden"
                onClick={() => remove(openConversation)}
                aria-label={`Eliminar la conversación «${openConversation.title}»`}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
            <ul className="hidden min-h-0 flex-1 flex-col gap-1 overflow-y-auto lg:flex">
              {conversations.map((conversation) => (
                <li key={conversation.id} className="group flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => open(conversation.id)}
                    aria-current={conversation.id === conversationId ? "true" : undefined}
                    className={cn(
                      "min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm hover:bg-accent",
                      conversation.id === conversationId && "bg-accent font-medium",
                    )}
                  >
                    {conversation.title}
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(conversation)}
                    aria-label={`Eliminar la conversación «${conversation.title}»`}
                    className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
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
            <Brain className="h-4 w-4" aria-hidden="true" />
            Copiloto
          </p>
          <div className="flex flex-wrap items-center gap-2">
            {skills.map((id) => (
              <span key={id} className="flex items-center gap-1 rounded-full bg-tint-lavender py-0.5 pl-2.5 pr-1 text-xs font-medium text-primary">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                Usando: {COPILOT_SKILL_NAMES[id] ?? id}
                <button
                  type="button"
                  onClick={() => changeSkill("remove", id)}
                  disabled={busy}
                  className="rounded-full p-0.5 hover:bg-white/70 disabled:opacity-50"
                  aria-label={`Dejar de usar ${COPILOT_SKILL_NAMES[id] ?? id} en esta conversación`}
                >
                  <X className="h-3 w-3" aria-hidden="true" />
                </button>
              </span>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" disabled={busy} className="flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs text-primary hover:bg-accent disabled:opacity-50">
                  <Plus className="h-3 w-3" aria-hidden="true" />
                  Habilidad
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Úsala en esta conversación aunque el copiloto no la elija</DropdownMenuLabel>
                {COPILOT_SKILL_CATALOG.map((skill) => (
                  <DropdownMenuItem
                    key={skill.id}
                    disabled={skills.includes(skill.id)}
                    onSelect={() => changeSkill("add", skill.id)}
                    className="flex flex-col items-start gap-0.5"
                  >
                    <span className="text-sm font-medium">{skill.nombre}</span>
                    <span className="text-xs text-muted-foreground">{skill.resumen}</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
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
                    onClick={() => {
                      // Se escribe en la caja, no se manda: Paula cambia el producto o la fecha antes de preguntar.
                      setInput(suggestion);
                      document.getElementById("copiloto-pregunta")?.focus();
                    }}
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
                    message.role === "assistant" ? (
                      <AssistantText key={index} text={part.text} storeId={storeId} />
                    ) : (
                      <p key={index} className="whitespace-pre-wrap break-words">
                        {part.text}
                      </p>
                    )
                  );
                }
                if (part.type.startsWith("tool-")) return <ToolLine key={index} part={part as ToolPart} />;
                return null;
              })}
              {message.role === "assistant" && !busy && extractDescriptionBlock(textOfMessage(message)) && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-2"
                  onClick={async () => {
                    const copied = await copyForProductPage(textOfMessage(message));
                    toast(
                      copied
                        ? { title: "Descripción copiada", description: "Pégala en la descripción del producto y revísala antes de guardar." }
                        : { title: "No se pudo copiar", description: "Selecciona el texto y cópialo a mano.", variant: "destructive" },
                    );
                  }}
                >
                  <ClipboardCopy className="h-3.5 w-3.5" aria-hidden="true" />
                  Copiar para la ficha
                </Button>
              )}
              {message.role === "assistant" && message.id === lastAssistant?.id && !busy && (
                <div className="mt-2 flex flex-wrap items-center gap-1">
                  {skillsChanged && (
                    <button
                      type="button"
                      onClick={() => {
                        setSkillsChanged(false);
                        regenerate();
                      }}
                      className="flex items-center gap-1 rounded-full border border-primary bg-tint-lavender px-2.5 py-0.5 text-xs font-medium text-primary hover:bg-accent"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      Responder de nuevo con estas habilidades
                    </button>
                  )}
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

function textOfMessage(message: UIMessage): string {
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("\n");
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
