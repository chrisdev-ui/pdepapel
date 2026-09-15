"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { MinimumOrderRule } from "@prisma/client";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { toast } from "@/hooks/use-toast";
import {
  DAY_LABELS,
  WEEK_DAYS,
  type ResolvedStoreSettings,
} from "@/lib/store-settings";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const formSchema = z.object({
  cityName: z.string().trim().max(80),
  hasPhysicalStore: z.boolean(),
  physicalAddress: z.string().trim().max(191),
  minOrderRule: z.nativeEnum(MinimumOrderRule),
  minOrderAmount: z.string().trim(),
  alwaysOpen: z.boolean(),
  botEnabled: z.boolean(),
  days: z.record(
    z.enum(WEEK_DAYS),
    z.object({
      abierto: z.boolean(),
      abre: z.string().trim(),
      cierra: z.string().trim(),
    }),
  ),
});

type FormValue = z.infer<typeof formSchema>;

export function BusinessInfoPanel({
  settings,
}: {
  settings: ResolvedStoreSettings;
}) {
  const params = useParams();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const form = useForm<FormValue>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cityName: settings.cityName ?? "",
      hasPhysicalStore: settings.hasPhysicalStore,
      physicalAddress: settings.physicalAddress ?? "",
      minOrderRule: settings.minOrderRule,
      minOrderAmount: settings.minOrderAmount
        ? String(settings.minOrderAmount)
        : "",
      alwaysOpen: settings.alwaysOpen,
      botEnabled: settings.botEnabled,
      days: Object.fromEntries(
        WEEK_DAYS.map((day) => {
          const saved = settings.openingHours?.[day];
          return [
            day,
            {
              abierto: Boolean(saved),
              abre: saved?.abre ?? "08:00",
              cierra: saved?.cierra ?? "20:00",
            },
          ];
        }),
      ) as FormValue["days"],
    },
  });

  const regla = form.watch("minOrderRule");
  const hayTienda = form.watch("hasPhysicalStore");
  const todaHora = form.watch("alwaysOpen");

  const onSubmit = async (values: FormValue) => {
    if (!values.alwaysOpen)
      for (const day of WEEK_DAYS) {
        const entry = values.days[day];
        if (!entry?.abierto) continue;
        if (!TIME.test(entry.abre) || !TIME.test(entry.cierra)) {
          toast({
            description: `Revisa la hora de ${DAY_LABELS[day]}: usa un formato como 08:00`,
            variant: "warning",
          });
          return;
        }
        if (entry.abre >= entry.cierra) {
          toast({
            description: `En ${DAY_LABELS[day]} la hora de cierre debe ir después de la de apertura`,
            variant: "warning",
          });
          return;
        }
      }

    try {
      setLoading(true);
      await axios.patch(`/api/${params.storeId}/settings`, {
        cityName: values.cityName || null,
        hasPhysicalStore: values.hasPhysicalStore,
        physicalAddress: values.physicalAddress || null,
        minOrderRule: values.minOrderRule,
        minOrderAmount: values.minOrderAmount
          ? Number(values.minOrderAmount)
          : null,
        alwaysOpen: values.alwaysOpen,
        botEnabled: values.botEnabled,
        openingHours: Object.fromEntries(
          WEEK_DAYS.map((day) => [
            day,
            values.days[day]?.abierto
              ? { abre: values.days[day].abre, cierra: values.days[day].cierra }
              : null,
          ]),
        ),
      });
      router.refresh();
      toast({ description: "Datos del negocio guardados", variant: "success" });
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? (error.response?.data?.error ?? "No se pudo guardar")
        : "No se pudo guardar";
      toast({ description: message, variant: "warning" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Heading
        title="Datos del negocio"
        description="Lo que responde la tienda y, más adelante, el bot de WhatsApp. Si cambias algo aquí, cambia en los dos sitios."
      />
      <Separator />
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="flex flex-col gap-6"
        >
          <div className="grid gap-6 md:grid-cols-2">
            <FormField
              control={form.control}
              name="cityName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ciudad del negocio</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Medellín"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Para responder «¿de dónde son?». No es la ciudad de origen
                    de los envíos.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="hasPhysicalStore"
              render={({ field }) => (
                <FormItem className="flex flex-col gap-2">
                  <FormLabel>¿Hay tienda física?</FormLabel>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={loading}
                    />
                  </FormControl>
                  <FormDescription>
                    Apagado significa que se vende solo en línea.
                  </FormDescription>
                </FormItem>
              )}
            />
          </div>

          {hayTienda && (
            <FormField
              control={form.control}
              name="physicalAddress"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dirección de la tienda</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="Calle 10 #40-20"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <div>
            <p className="mb-2 text-sm font-semibold text-primary">
              Horario de atención
            </p>
            <FormField
              control={form.control}
              name="alwaysOpen"
              render={({ field }) => (
                <FormItem className="mb-3 flex flex-col gap-2">
                  <FormLabel>Atendemos a toda hora</FormLabel>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={loading}
                    />
                  </FormControl>
                  <FormDescription>
                    El horario dice cuándo contestas tú; el bot cubre el resto
                    del tiempo.
                  </FormDescription>
                </FormItem>
              )}
            />
            <div className={todaHora ? "hidden" : "flex flex-col gap-2"}>
              {WEEK_DAYS.map((day) => (
                <div
                  key={day}
                  className="flex flex-wrap items-center gap-3 rounded-lg border p-3"
                >
                  <FormField
                    control={form.control}
                    name={`days.${day}.abierto`}
                    render={({ field }) => (
                      <FormItem className="flex items-center gap-2 space-y-0">
                        <FormControl>
                          <Switch
                            checked={field.value}
                            onCheckedChange={field.onChange}
                            disabled={loading}
                          />
                        </FormControl>
                        <FormLabel className="w-20">
                          {DAY_LABELS[day]}
                        </FormLabel>
                      </FormItem>
                    )}
                  />
                  {form.watch(`days.${day}.abierto`) ? (
                    <div className="flex items-center gap-2">
                      <FormField
                        control={form.control}
                        name={`days.${day}.abre`}
                        render={({ field }) => (
                          <FormItem className="space-y-0">
                            <FormControl>
                              <Input
                                type="time"
                                className="w-32"
                                disabled={loading}
                                {...field}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                      <span className="text-sm text-muted-foreground">a</span>
                      <FormField
                        control={form.control}
                        name={`days.${day}.cierra`}
                        render={({ field }) => (
                          <FormItem className="space-y-0">
                            <FormControl>
                              <Input
                                type="time"
                                className="w-32"
                                disabled={loading}
                                {...field}
                              />
                            </FormControl>
                          </FormItem>
                        )}
                      />
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">
                      Cerrado
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <FormField
              control={form.control}
              name="minOrderRule"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Sugerencia de pedido mínimo</FormLabel>
                  <Select
                    onValueChange={field.onChange}
                    value={field.value}
                    disabled={loading}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value={MinimumOrderRule.NONE}>
                        Sin sugerencia
                      </SelectItem>
                      <SelectItem value={MinimumOrderRule.MATCH_SHIPPING}>
                        Que el pedido valga al menos lo que cuesta el envío
                      </SelectItem>
                      <SelectItem value={MinimumOrderRule.FIXED}>
                        Un monto fijo
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Es una sugerencia: nunca impide comprar.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            {regla === MinimumOrderRule.FIXED && (
              <FormField
                control={form.control}
                name="minOrderAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Monto sugerido (COP)</FormLabel>
                    <FormControl>
                      <Input
                        disabled={loading}
                        inputMode="numeric"
                        placeholder="50000"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
          </div>

          <FormField
            control={form.control}
            name="botEnabled"
            render={({ field }) => (
              <FormItem className="flex flex-col gap-2">
                <FormLabel>Bot de WhatsApp activo</FormLabel>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={loading}
                  />
                </FormControl>
                <FormDescription>
                  Todavía no apaga nada: se conecta cuando el bot aprenda a
                  responder preguntas.
                </FormDescription>
              </FormItem>
            )}
          />

          <Button type="submit" disabled={loading} className="self-start">
            Guardar
          </Button>
        </form>
      </Form>
    </div>
  );
}
