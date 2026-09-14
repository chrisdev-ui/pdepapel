"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { ArrowLeft, BadgeCheck, Plus, Save, ShieldAlert, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Heading } from "@/components/ui/heading";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Combobox } from "@/components/ui/combobox";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { WHATSAPP_BOT_MARKER } from "@/lib/whatsapp/bot-matching";
import type { BotReplyDraft } from "@/lib/whatsapp/bot-reply-assistant";
import {
  BOT_REPLY_ANSWER_MAX_LENGTH,
  BOT_REPLY_BUTTON_TITLE_MAX,
  BOT_REPLY_MAX_BUTTONS,
  TALK_TO_OWNER_BUTTON_TITLE,
  parseTriggerLines,
  triggersToLines,
  type BotReplyRow,
} from "@/lib/whatsapp/bot-replies";

const formSchema = z.object({
  label: z.string().trim().min(1, "Ponle un nombre para reconocerla").max(80),
  triggerLines: z
    .string()
    .trim()
    .min(1, "Escribe al menos una frase")
    .refine((value) => parseTriggerLines(value).length > 0, "Escribe al menos una frase"),
  answer: z
    .string()
    .trim()
    .min(1, "Escribe lo que quieres que conteste")
    .max(BOT_REPLY_ANSWER_MAX_LENGTH, "Es muy largo para un mensaje de WhatsApp"),
  isActive: z.boolean(),
  sortOrder: z.coerce.number().int().min(0).max(9999),
  buttons: z
    .array(
      z.object({
        title: z
          .string()
          .trim()
          .min(1, "Ponle texto al botón")
          .max(BOT_REPLY_BUTTON_TITLE_MAX, `Máximo ${BOT_REPLY_BUTTON_TITLE_MAX} caracteres`),
        targetReplyId: z.string().trim().min(1, "Elige a qué respuesta lleva"),
      }),
    )
    .max(BOT_REPLY_MAX_BUTTONS),
});

type BotReplyFormValues = z.infer<typeof formSchema>;

export function BotReplyForm({
  initialData,
  draft = null,
  targets = [],
  canApprove = true,
  storeId,
}: {
  initialData: BotReplyRow | null;
  /** Propuesta del asistente para una respuesta nueva; se puede editar toda. */
  draft?: BotReplyDraft | null;
  /** Otras respuestas de la tienda: son los destinos posibles de un botón. */
  targets?: { id: string; label: string }[];
  /** Si esta persona puede dar el visto bueno a un menú. */
  canApprove?: boolean;
  storeId: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [approvedAt, setApprovedAt] = useState<Date | null>(initialData?.approvedAt ?? null);
  const listHref = `/${storeId}/conversaciones/respuestas`;

  const toggleApproval = async (approve: boolean) => {
    if (!initialData) return;
    try {
      setLoading(true);
      const url = `/api/${storeId}/bot-replies/${initialData.id}/approve`;
      if (approve) await axios.post(url);
      else await axios.delete(url);
      setApprovedAt(approve ? new Date() : null);
      router.refresh();
      toast({
        title: approve ? "Menú aprobado" : "Aprobación retirada",
        description: approve
          ? "El bot ya puede mandarlo."
          : "El bot deja de mandarlo hasta que lo apruebes otra vez.",
        variant: approve ? "success" : "warning",
      });
    } catch (error) {
      toast({
        title: "No se pudo cambiar la aprobación",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const defaultValues = useMemo<BotReplyFormValues>(
    () => ({
      label: initialData?.label ?? draft?.label ?? "",
      triggerLines: initialData
        ? triggersToLines(initialData.triggers)
        : (draft?.triggers ?? ""),
      answer: initialData?.answer ?? draft?.answer ?? "",
      isActive: initialData?.isActive ?? true,
      sortOrder: initialData?.sortOrder ?? 0,
      buttons: initialData?.buttons ?? [],
    }),
    [initialData, draft],
  );

  const form = useForm<BotReplyFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const buttonFields = useFieldArray({ control: form.control, name: "buttons" });
  const buttons = form.watch("buttons");
  const answer = form.watch("answer");
  const triggerLines = form.watch("triggerLines");
  // Lo que realmente se va a guardar, ya limpio: así ve el efecto de escribir
  // con tildes o mayúsculas antes de guardar.
  const normalizedTriggers = useMemo(() => parseTriggerLines(triggerLines ?? ""), [triggerLines]);

  const onSubmit = async (values: BotReplyFormValues) => {
    try {
      setLoading(true);
      const payload = {
        label: values.label,
        triggers: parseTriggerLines(values.triggerLines),
        answer: values.answer,
        isActive: values.isActive,
        sortOrder: values.sortOrder,
        buttons: values.buttons,
      };
      if (initialData) {
        await axios.patch(`/api/${storeId}/bot-replies/${initialData.id}`, payload);
      } else {
        await axios.post(`/api/${storeId}/bot-replies`, payload);
      }
      // Navegar primero y refrescar después: al revés, el refresco se aplica a
      // esta pantalla y la lista se sirve desde la caché del router, así que la
      // respuesta recién guardada no aparece hasta recargar a mano.
      router.push(listHref);
      router.refresh();
      toast({
        title: initialData ? "Respuesta guardada" : "Respuesta creada",
        description: !values.isActive
          ? "Queda guardada pero apagada."
          : values.buttons.length > 0
            ? "Tiene botones, así que Paula debe aprobarla antes de que salga."
            : "El bot empieza a usarla de inmediato.",
        variant: "success",
      });
    } catch (error) {
      toast({
        title: "No se pudo guardar",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <Heading
          title={initialData ? initialData.label : "Nueva respuesta automática"}
          description="Cuando alguien escriba una de estas frases, el bot contesta esto una sola vez."
        />
        <Button variant="ghost" size="sm" onClick={() => router.push(listHref)}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Volver
        </Button>
      </div>
      <Separator />

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-2xl space-y-6">
          <FormField
            control={form.control}
            name="label"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre</FormLabel>
                <FormControl>
                  <Input disabled={loading} placeholder="Horarios" {...field} />
                </FormControl>
                <FormDescription>
                  Solo para que tú la reconozcas en la lista. La clienta no lo ve.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="triggerLines"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Frases que la activan</FormLabel>
                <FormControl>
                  <Textarea
                    disabled={loading}
                    rows={5}
                    placeholder={"horario\na que hora abren\nestan abiertos"}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  Una por línea. No te preocupes por tildes ni mayúsculas: se
                  ignoran. Basta con que la frase aparezca dentro del mensaje.
                </FormDescription>
                {normalizedTriggers.length > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    Se guardarán así: {normalizedTriggers.join(" · ")}
                  </p>
                ) : null}
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="answer"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Respuesta</FormLabel>
                <FormControl>
                  <Textarea
                    disabled={loading}
                    rows={5}
                    placeholder="Atendemos de lunes a sábado, de 9 a. m. a 6 p. m."
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {answer?.length ?? 0} de {BOT_REPLY_ANSWER_MAX_LENGTH} caracteres.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Botones (opcional)</p>
                <p className="text-xs text-muted-foreground">
                  Cada botón lleva a otra de tus respuestas. Puedes poner hasta{" "}
                  {BOT_REPLY_MAX_BUTTONS}: el tercero siempre es «
                  {TALK_TO_OWNER_BUTTON_TITLE}» y lo pone el sistema.
                </p>
              </div>
              {buttonFields.fields.length < BOT_REPLY_MAX_BUTTONS ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loading || targets.length === 0}
                  onClick={() => buttonFields.append({ title: "", targetReplyId: "" })}
                >
                  <Plus className="mr-2 h-4 w-4" /> Agregar botón
                </Button>
              ) : null}
            </div>

            {targets.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Para poner botones necesitas al menos otra respuesta creada: un
                botón siempre lleva a una de ellas.
              </p>
            ) : null}

            {buttonFields.fields.map((field, index) => (
              <div key={field.id} className="flex flex-wrap items-end gap-2">
                <FormField
                  control={form.control}
                  name={`buttons.${index}.title`}
                  render={({ field: titleField }) => (
                    <FormItem className="min-w-[9rem] flex-1">
                      <FormLabel className="text-xs">Texto del botón</FormLabel>
                      <FormControl>
                        <Input
                          disabled={loading}
                          maxLength={BOT_REPLY_BUTTON_TITLE_MAX}
                          placeholder="Ver horarios"
                          {...titleField}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name={`buttons.${index}.targetReplyId`}
                  render={({ field: targetField }) => (
                    <FormItem className="min-w-[12rem] flex-[2]">
                      <FormLabel className="text-xs">Lleva a</FormLabel>
                      <FormControl>
                        <Combobox
                          options={targets.map((target) => ({
                            value: target.id,
                            label: target.label,
                          }))}
                          value={targetField.value || null}
                          onChange={(value) => targetField.onChange(value ?? "")}
                          placeholder="Elige una respuesta"
                          searchPlaceholder="Escribe para buscar…"
                          emptyText="No hay más respuestas"
                          disabled={loading}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  disabled={loading}
                  onClick={() => buttonFields.remove(index)}
                >
                  <Trash2 className="h-4 w-4" />
                  <span className="sr-only">Quitar este botón</span>
                </Button>
              </div>
            ))}
          </div>

          {buttons.length > 0 ? (
            <Card className={approvedAt ? "border-emerald-500/40" : "border-amber-500/50"}>
              <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div className="flex items-start gap-2">
                  {approvedAt ? (
                    <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      {approvedAt ? "Menú aprobado" : "Pendiente de aprobación"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {approvedAt
                        ? "Si cambias el texto o los botones, la aprobación se retira sola."
                        : !initialData
                          ? "Guárdala primero y después apruébala."
                          : canApprove
                            ? "Un menú no se manda hasta que lo apruebes."
                            : "Un menú no se manda hasta que Paula lo apruebe. Tu cuenta no puede aprobarlo."}
                    </p>
                  </div>
                </div>
                {initialData && canApprove ? (
                  <Button
                    type="button"
                    variant={approvedAt ? "outline" : "default"}
                    size="sm"
                    disabled={loading}
                    onClick={() => toggleApproval(!approvedAt)}
                  >
                    {approvedAt ? "Retirar aprobación" : "Aprobar menú"}
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          <Card className="bg-muted/30">
            <CardContent className="space-y-2 p-4">
              <p className="text-sm font-medium">Así lo recibe la clienta</p>
              <div className="space-y-2 rounded-md border bg-background p-3">
                <p className="whitespace-pre-wrap text-sm">
                  {`${WHATSAPP_BOT_MARKER}\n\n${answer?.trim() || "…"}`}
                </p>
                <div className="flex flex-col gap-1 border-t pt-2">
                  {buttons.map((button, index) => (
                    <span
                      key={index}
                      className="rounded border bg-muted/40 py-1 text-center text-xs font-medium"
                    >
                      {button.title.trim() || "…"}
                    </span>
                  ))}
                  <span className="rounded border bg-muted/40 py-1 text-center text-xs font-medium">
                    {TALK_TO_OWNER_BUTTON_TITLE}
                  </span>
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                La primera línea y el botón «{TALK_TO_OWNER_BUTTON_TITLE}» los
                pone el sistema: la clienta siempre puede salirse a hablar
                contigo. No hace falta que los escribas.
              </p>
            </CardContent>
          </Card>

          <div className="flex flex-wrap gap-6">
            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex items-center gap-3 space-y-0">
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={loading}
                    />
                  </FormControl>
                  <div>
                    <FormLabel>Activa</FormLabel>
                    <FormDescription>Apágala para pausarla sin borrarla.</FormDescription>
                  </div>
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="sortOrder"
              render={({ field }) => (
                <FormItem className="w-32">
                  <FormLabel>Orden</FormLabel>
                  <FormControl>
                    <Input type="number" min={0} disabled={loading} {...field} />
                  </FormControl>
                  <FormDescription>Gana la más baja.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <Button type="submit" disabled={loading}>
            <Save className="mr-2 h-4 w-4" />
            {initialData ? "Guardar cambios" : "Crear respuesta"}
          </Button>
        </form>
      </Form>
    </>
  );
}
