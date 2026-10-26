"use client";

import { formatWhatsappNumber, normalizeWhatsappNumber } from "@/lib/whatsapp-number";
import { zodResolver } from "@hookform/resolvers/zod";
import { BotAssistMode, MinimumOrderRule } from "@prisma/client";
import axios from "axios";
import { useParams } from "next/navigation";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import type { ResolvedStoreSettings } from "@/lib/store-settings";
import {
  DAY_LABELS,
  DEFAULT_DELIVERY_ESTIMATE,
  WEEK_DAYS,
} from "@/lib/store-settings-labels";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

const formSchema = z.object({
  cityName: z.string().trim().max(80),
  deliveryEstimate: z.string().trim().max(120),
  paymentCashInfo: z.string().trim().max(300),
  paymentBancolombiaAccount: z.string().trim().max(300),
  paymentNequiNumber: z.string().trim().max(300),
  paymentDaviplataNumber: z.string().trim().max(300),
  paymentBreBKey: z.string().trim().max(120),
  whatsappNumber: z
    .string()
    .trim()
    .refine((value) => !value || normalizeWhatsappNumber(value) !== null, {
      message: "Escribe un celular colombiano: 10 dígitos que empiezan por 3",
    }),
  paymentCardInfo: z.string().trim().max(300),
  hasPhysicalStore: z.boolean(),
  physicalAddress: z.string().trim().max(191),
  minOrderRule: z.nativeEnum(MinimumOrderRule),
  minOrderAmount: z.string().trim(),
  alwaysOpen: z.boolean(),
  botEnabled: z.boolean(),
  botReadBursts: z.boolean(),
  botFallbackMode: z.nativeEnum(BotAssistMode),
  botHoldingMode: z.nativeEnum(BotAssistMode),
  waitingReminderEmail: z.boolean(),
  botHoldingText: z.string().trim().max(500),
  botHoldingNightText: z.string().trim().max(500),
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
  const [loading, setLoading] = useState(false);

  const form = useForm<FormValue>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      cityName: settings.cityName ?? "",
      deliveryEstimate: settings.deliveryEstimate ?? DEFAULT_DELIVERY_ESTIMATE,
      paymentCashInfo: settings.paymentCashInfo ?? "",
      paymentBancolombiaAccount: settings.paymentBancolombiaAccount ?? "",
      paymentNequiNumber: settings.paymentNequiNumber ?? "",
      paymentDaviplataNumber: settings.paymentDaviplataNumber ?? "",
      paymentBreBKey: settings.paymentBreBKey ?? "",
      whatsappNumber: settings.whatsappNumber ? formatWhatsappNumber(settings.whatsappNumber) : "",
      paymentCardInfo: settings.paymentCardInfo ?? "",
      hasPhysicalStore: settings.hasPhysicalStore,
      physicalAddress: settings.physicalAddress ?? "",
      minOrderRule: settings.minOrderRule,
      minOrderAmount: settings.minOrderAmount
        ? String(settings.minOrderAmount)
        : "",
      alwaysOpen: settings.alwaysOpen,
      botEnabled: settings.botEnabled,
      botReadBursts: settings.botReadBursts,
      botFallbackMode: settings.botFallbackMode,
      botHoldingMode: settings.botHoldingMode,
      waitingReminderEmail: settings.waitingReminderEmail,
      botHoldingText: settings.botHoldingText ?? "",
      botHoldingNightText: settings.botHoldingNightText ?? "",
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
        deliveryEstimate: values.deliveryEstimate || null,
        paymentCashInfo: values.paymentCashInfo || null,
        paymentBancolombiaAccount: values.paymentBancolombiaAccount || null,
        paymentNequiNumber: values.paymentNequiNumber || null,
        paymentDaviplataNumber: values.paymentDaviplataNumber || null,
        paymentBreBKey: values.paymentBreBKey || null,
        whatsappNumber: values.whatsappNumber || null,
        paymentCardInfo: values.paymentCardInfo || null,
        hasPhysicalStore: values.hasPhysicalStore,
        physicalAddress: values.physicalAddress || null,
        minOrderRule: values.minOrderRule,
        minOrderAmount: values.minOrderAmount
          ? Number(values.minOrderAmount)
          : null,
        alwaysOpen: values.alwaysOpen,
        botEnabled: values.botEnabled,
        botReadBursts: values.botReadBursts,
        botFallbackMode: values.botFallbackMode,
        botHoldingMode: values.botHoldingMode,
        waitingReminderEmail: values.waitingReminderEmail,
        botHoldingText: values.botHoldingText.trim() || null,
        botHoldingNightText: values.botHoldingNightText.trim() || null,
        openingHours: Object.fromEntries(
          WEEK_DAYS.map((day) => [
            day,
            values.days[day]?.abierto
              ? { abre: values.days[day].abre, cierra: values.days[day].cierra }
              : null,
          ]),
        ),
      });
      // Sin refrescar la página: remontaba la pestaña y borraba lo escrito sin guardar en los otros paneles.
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
              name="deliveryEstimate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cuánto tarda en llegar</FormLabel>
                  <FormControl>
                    <Input
                      disabled={loading}
                      placeholder="2 a 6 días hábiles"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Se cuenta desde que se confirma el pago. Se muestra en la
                    ficha del producto, en la política de envíos y en el bot.
                    Merchant Center declara 2 a 6 días hábiles.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-4 rounded-lg border p-4 md:col-span-2">
              <div>
                <h4 className="text-sm font-medium">Cómo se paga</h4>
                <p className="text-sm text-muted-foreground">
                  El bot ofrece estas formas en un menú que la clienta toca. La
                  que dejes vacía no se muestra, así que llena solo las que de
                  verdad aceptas. Revisa los números antes de guardar: van a
                  alguien que va a transferir.
                </p>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <FormField
                  control={form.control}
                  name="paymentCashInfo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Efectivo</FormLabel>
                      <FormControl>
                        <Textarea
                          disabled={loading}
                          rows={2}
                          placeholder="Con gusto, trae el valor exacto si puedes."
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Si recibes el pago en un sitio concreto, la dirección va
                        aquí: con «¿Hay tienda física?» apagado, este es el
                        único lugar donde una clienta la ve. Decirla aquí no es
                        abrir un local al público.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="paymentCardInfo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Datáfono</FormLabel>
                      <FormControl>
                        <Textarea
                          disabled={loading}
                          rows={2}
                          placeholder="Recibimos todas las tarjetas en el datáfono."
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        Qué tarjetas recibes y si hay algún recargo.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="space-y-4 rounded-md border border-dashed p-4">
                <div>
                  <h5 className="text-sm font-medium">Transferencia</h5>
                  <p className="text-sm text-muted-foreground">
                    Estas tres salen en un segundo menú, al tocar
                    «Transferencia». La de Bancolombia va con el QR.
                  </p>
                </div>

                <FormField
                  control={form.control}
                  name="paymentBancolombiaAccount"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Bancolombia</FormLabel>
                      <FormControl>
                        <Input
                          disabled={loading}
                          placeholder="Cuenta de Ahorros #…"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="paymentNequiNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nequi</FormLabel>
                        <FormControl>
                          <Input disabled={loading} placeholder="31…" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="paymentDaviplataNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Daviplata</FormLabel>
                        <FormControl>
                          <Input disabled={loading} placeholder="31…" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <div className="space-y-1 border-t pt-4">
                  <h5 className="text-sm font-medium">Datos de pago en la tienda y el correo</h5>
                  <p className="text-sm text-muted-foreground">
                    La página del pedido, el checkout y el correo de «Pendiente de pago» muestran la cuenta de
                    Bancolombia de arriba, esta llave y este WhatsApp. Si alguno queda vacío, la clienta ve
                    «Escríbenos por WhatsApp para los datos de pago».
                  </p>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="paymentBreBKey"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Llave Bre-B</FormLabel>
                        <FormControl>
                          <Input disabled={loading} placeholder="@…" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="whatsappNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>WhatsApp del negocio</FormLabel>
                        <FormControl>
                          <Input disabled={loading} inputMode="tel" placeholder="Celular de 10 dígitos" {...field} />
                        </FormControl>
                        <FormDescription>Adonde la clienta manda el comprobante.</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>

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
                  Apagado, el bot no contesta nada en WhatsApp. Los mensajes
                  siguen llegando y quedan en Conversaciones, esperando a
                  Paula. El cambio aplica desde el siguiente mensaje.
                </FormDescription>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="botReadBursts"
            render={({ field }) => (
              <FormItem className="flex flex-col gap-2">
                <FormLabel>Leer mensajes seguidos como uno solo</FormLabel>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={loading}
                  />
                </FormControl>
                <FormDescription>
                  Cuando una clienta escribe varios mensajes seguidos («Hola»,
                  «¿tienes el cuaderno Norma?», «es para mi hija»), el bot
                  contesta lo que sí entiende de todos, no solo el último. Si
                  no entiende nada, se lo pasa a Paula como siempre.
                </FormDescription>
              </FormItem>
            )}
          />

          <div className="flex flex-col gap-4 rounded-lg border p-4">
            <div>
              <h3 className="text-sm font-semibold">Mientras la clienta te espera</h3>
              <p className="text-sm text-muted-foreground">
                Cuando escribiste en las últimas 24 h el bot se aparta. Esto decide qué hace si
                pasan unos minutos y nadie le responde. En «Sombra» solo se anota lo que haría:
                a la clienta no le llega nada.
              </p>
            </div>
            <AssistModeField
              control={form.control}
              name="botFallbackMode"
              label="Respuesta del bot a los 10 minutos"
              description="Solo preguntas que el bot contesta bien (horario, envíos, pagos, productos, pedidos, enlaces de la tienda). Si estás conversando con ella o hay un pedido abierto, solo datos del negocio. Nunca «Esa no me la sé». Se marca en la conversación como «El bot contestó por ti»."
              disabled={loading}
            />
            <AssistModeField
              control={form.control}
              name="botHoldingMode"
              label="Mensaje de espera"
              description="Una vez por espera: a los 15 minutos de 7 a. m. a 11:59 p. m., y enseguida de 12 a 6:59 a. m. Nunca después de «ok» o «gracias». Sin texto no sale nada, aunque esté encendido."
              disabled={loading}
            />
            <FormField
              control={form.control}
              name="botHoldingText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Texto del mensaje de espera (de día)</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} maxLength={500} disabled={loading} placeholder="Lo escribes tú. Vacío, no sale nada." />
                  </FormControl>
                  <FormDescription>De 7:00 a. m. a 11:59 p. m.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="botHoldingNightText"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Texto del mensaje de espera (de noche)</FormLabel>
                  <FormControl>
                    <Textarea {...field} rows={2} maxLength={500} disabled={loading} placeholder="Lo escribes tú. Vacío, no sale nada." />
                  </FormControl>
                  <FormDescription>De 12:00 a 6:59 a. m., cuando no vas a contestar enseguida.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="waitingReminderEmail"
              render={({ field }) => (
                <FormItem className="flex flex-col gap-2">
                  <FormLabel>Avisarme por correo cuando un cliente espere</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} disabled={loading} />
                  </FormControl>
                  <FormDescription>
                    Apagado, no llega ningún correo: las esperas se ven en Conversaciones, en «Esperando a
                    Paula». Encendido, un correo con cuántas clientas llevan 30 minutos o más sin respuesta
                    (solo las del último día), como mucho uno por hora y de 8 a. m. a 11 p. m.
                  </FormDescription>
                </FormItem>
              )}
            />
          </div>

          <Button type="submit" disabled={loading} className="self-start">
            Guardar
          </Button>
        </form>
      </Form>
    </div>
  );
}

const ASSIST_MODE_LABELS: Record<BotAssistMode, string> = {
  [BotAssistMode.OFF]: "Apagado",
  [BotAssistMode.SHADOW]: "Sombra (solo se anota)",
  [BotAssistMode.ON]: "Encendido",
};

function AssistModeField({
  control,
  name,
  label,
  description,
  disabled,
}: {
  control: ReturnType<typeof useForm<FormValue>>["control"];
  name: "botFallbackMode" | "botHoldingMode";
  label: string;
  description: string;
  disabled: boolean;
}) {
  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <Select onValueChange={field.onChange} value={field.value} disabled={disabled}>
            <FormControl>
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {Object.values(BotAssistMode).map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {ASSIST_MODE_LABELS[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FormDescription>{description}</FormDescription>
        </FormItem>
      )}
    />
  );
}

