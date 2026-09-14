"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { ArrowLeft, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
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
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { WHATSAPP_BOT_MARKER } from "@/lib/whatsapp/bot-matching";
import {
  BOT_REPLY_ANSWER_MAX_LENGTH,
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
});

type BotReplyFormValues = z.infer<typeof formSchema>;

export function BotReplyForm({
  initialData,
  storeId,
}: {
  initialData: BotReplyRow | null;
  storeId: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const listHref = `/${storeId}/conversaciones/respuestas`;

  const defaultValues = useMemo<BotReplyFormValues>(
    () => ({
      label: initialData?.label ?? "",
      triggerLines: initialData ? triggersToLines(initialData.triggers) : "",
      answer: initialData?.answer ?? "",
      isActive: initialData?.isActive ?? true,
      sortOrder: initialData?.sortOrder ?? 0,
    }),
    [initialData],
  );

  const form = useForm<BotReplyFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

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
        description: values.isActive
          ? "El bot empieza a usarla de inmediato."
          : "Queda guardada pero apagada.",
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

          <Card className="bg-muted/30">
            <CardContent className="space-y-2 p-4">
              <p className="text-sm font-medium">Así lo recibe la clienta</p>
              <div className="whitespace-pre-wrap rounded-md border bg-background p-3 text-sm">
                {`${WHATSAPP_BOT_MARKER}\n\n${answer?.trim() || "…"}`}
              </div>
              <p className="text-xs text-muted-foreground">
                La primera línea la pone el sistema para que se note que es
                automática. No hace falta que la escribas.
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
