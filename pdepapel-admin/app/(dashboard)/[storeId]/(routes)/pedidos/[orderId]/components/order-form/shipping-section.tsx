"use client";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CountInput } from "@/components/ui/count-input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DatePicker } from "@/components/ui/date-picker";
import { FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { shippingOptions } from "@/constants";
import { getCarrierInfo } from "@/constants/shipping";
import { useToast } from "@/hooks/use-toast";
import { cn, currencyFormatter } from "@/lib/utils";
import { PaymentMethod, ShippingProvider, type Box } from "@prisma/client";
import { Check, Loader2, Package, RefreshCw, Store, Truck } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, type ReactNode } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import type { GetOrderResult } from "../../server/get-order";
import type { OrderFormValues, ShippingQuote } from "./schema";
import { SectionCard } from "./section-card";

interface ShippingSectionProps {
  boxes: Box[];
  initialData: GetOrderResult["order"];
  loading: boolean;
  loadingQuotes: boolean;
  shippingQuotes: ShippingQuote[];
  selectedRateId: number | null;
  recommendedBox: { name: string; width: number; height: number; length: number } | null;
  onGetShippingQuotes: () => void;
  onSelectRate: (quote: ShippingQuote) => void;
  onClearRate: () => void;
  /** Estado real del envío (guía, seguimiento): se muestra debajo de la configuración. */
  children?: ReactNode;
}

function BoxSelect({ boxes, value, onChange, id }: { boxes: Box[]; value?: string; onChange: (boxId: string) => void; id: string }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Caja</Label>
      <Select value={value || "auto"} onValueChange={onChange}>
        <SelectTrigger id={id} className="sm:max-w-xs">
          <SelectValue placeholder="Automática (recomendada)" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="auto">Automática (recomendada)</SelectItem>
          {boxes.map((box) => (
            <SelectItem key={box.id} value={box.id}>
              {box.name} ({box.width}×{box.height}×{box.length} cm)
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ShippingSection({ boxes, initialData, loading, loadingQuotes, shippingQuotes, selectedRateId, recommendedBox, onGetShippingQuotes, onSelectRate, onClearRate, children }: ShippingSectionProps) {
  const form = useFormContext<OrderFormValues>();
  const { toast } = useToast();
  const provider = useWatch({ control: form.control, name: "shippingProvider" });
  const boxId = useWatch({ control: form.control, name: "shipping.boxId" });
  const city = useWatch({ control: form.control, name: "city" });
  const daneCode = useWatch({ control: form.control, name: "daneCode" });
  const carrierName = useWatch({ control: form.control, name: "shipping.carrierName" });
  const courier = useWatch({ control: form.control, name: "shipping.courier" });
  const rateId = useWatch({ control: form.control, name: "envioClickIdRate" });
  const hasGuide = Boolean(initialData?.shipping?.envioClickIdOrder);
  const carrierInfo = getCarrierInfo(carrierName || courier || "");

  // Una tarifa vale para una ciudad: si cambia el destino, la cotización
  // guardada ya no sirve y se descarta antes de que llegue a la guía.
  const quotedDane = useRef<string | undefined>(initialData?.shipping?.envioClickIdRate ? initialData.daneCode ?? undefined : undefined);
  useEffect(() => {
    if (rateId && !quotedDane.current) quotedDane.current = daneCode || undefined;
  }, [rateId, daneCode]);
  useEffect(() => {
    if (!rateId || hasGuide || !quotedDane.current || !daneCode || daneCode === quotedDane.current) return;
    quotedDane.current = undefined;
    onClearRate();
    toast({ title: "Cotización descartada", description: "Cambió la ciudad de entrega: vuelve a cotizar para tener una tarifa válida.", variant: "warning" });
  }, [daneCode, rateId, hasGuide, onClearRate, toast]);

  const providerCards: { value: ShippingProvider; title: string; hint: string; icon: ReactNode }[] = [
    { value: ShippingProvider.NONE, title: "Recoge en tienda", hint: "Sin transportadora; el cliente pasa por el pedido.", icon: <Store className="h-5 w-5 text-primary" aria-hidden="true" /> },
    { value: ShippingProvider.ENVIOCLICK, title: "EnvioClick", hint: "Cotiza, elige transportadora y la guía se crea sola al pagar.", icon: <Image src="https://www.envioclickpro.com.co/img/register/logo_solo.svg" alt="" width={20} height={20} className="h-5 w-5 object-contain" /> },
    { value: ShippingProvider.MANUAL, title: "Otra transportadora", hint: "Registra guía y costo a mano.", icon: <Truck className="h-5 w-5 text-primary" aria-hidden="true" /> },
  ];

  return (
    <SectionCard id="envio" title="Envío y empaque" description={hasGuide ? `Guía de EnvioClick creada (${initialData?.shipping?.envioClickIdOrder}). La configuración ya no cambia.` : "Cómo llega el pedido. Con EnvioClick, la guía se crea al marcarlo pagado."}>
      <FormField
        control={form.control}
        name="shippingProvider"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <RadioGroup key={field.value} onValueChange={field.onChange} value={field.value} className="grid grid-cols-1 gap-3 sm:grid-cols-3" disabled={loading || hasGuide} aria-label="Tipo de envío">
                {providerCards.map((card) => (
                  <Label
                    key={card.value}
                    htmlFor={`envio-${card.value}`}
                    className={cn(
                      "flex min-h-[44px] cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors hover:border-primary/40",
                      field.value === card.value && "border-primary bg-accent/40",
                      (loading || hasGuide) && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <RadioGroupItem value={card.value} id={`envio-${card.value}`} className="mt-0.5" />
                    <span className="flex flex-col gap-1">
                      <span className="flex items-center gap-2 font-semibold">
                        {card.icon}
                        {card.title}
                      </span>
                      <span className="text-xs font-normal text-muted-foreground">{card.hint}</span>
                    </span>
                  </Label>
                ))}
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {provider === ShippingProvider.NONE && (
        <div className="grid grid-cols-1 gap-4 rounded-lg bg-muted/50 p-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="shipping.status"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Estado de la entrega</FormLabel>
                <Select disabled={loading} onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Elige un estado" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {Object.entries(shippingOptions).map(([key, label]) => (
                      <SelectItem key={key} value={key}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="shipping.cost"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Costo adicional</FormLabel>
                <FormControl>
                  <CurrencyInput placeholder="$ 0" disabled={loading} value={field.value} onChange={field.onChange} />
                </FormControl>
                <FormDescription>Solo si se cobra algo por la entrega.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="shipping.notes"
            render={({ field }) => (
              <FormItem className="sm:col-span-2">
                <FormLabel>Nota para el cliente</FormLabel>
                <FormControl>
                  <Textarea disabled={loading} rows={2} placeholder="Ej: Listo para recoger mañana después de las 2 p. m." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}

      {provider === ShippingProvider.ENVIOCLICK && (
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 sm:flex-row sm:items-end sm:justify-between">
            <BoxSelect id="caja-envioclick" boxes={boxes} value={boxId} onChange={(value) => form.setValue("shipping.boxId", value === "auto" ? undefined : value, { shouldDirty: true })} />
            <Button type="button" variant="soft" onClick={onGetShippingQuotes} disabled={loadingQuotes || !city || !daneCode || hasGuide}>
              {loadingQuotes ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Package className="h-4 w-4" aria-hidden="true" />}
              {shippingQuotes.length > 0 ? "Cotizar de nuevo" : "Cotizar envío"}
            </Button>
          </div>
          {!city && <p className="text-xs text-muted-foreground">Elige primero la ciudad del cliente para cotizar.</p>}

          {shippingQuotes.length > 0 && (
            <div className="flex flex-col gap-3">
              {recommendedBox && (
                <p className="text-xs text-muted-foreground">
                  Caja usada para cotizar: {recommendedBox.name} ({recommendedBox.width}×{recommendedBox.height}×{recommendedBox.length} cm)
                </p>
              )}
              <div className="flex items-center justify-between">
                <Label>Elige una tarifa</Label>
                <Button type="button" variant="ghost" size="xs" onClick={onGetShippingQuotes} disabled={loadingQuotes} aria-label="Volver a cotizar">
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </div>
              <RadioGroup
                key={selectedRateId?.toString() || "no-rate"}
                value={selectedRateId?.toString() || ""}
                onValueChange={(value) => {
                  const quote = shippingQuotes.find((q) => q.idRate === parseInt(value));
                  if (quote) onSelectRate(quote);
                }}
                className="flex flex-col gap-2"
                aria-label="Tarifas de envío"
              >
                {shippingQuotes.map((quote) => {
                  const info = getCarrierInfo(quote.carrier);
                  return (
                    <div key={quote.idRate}>
                      <RadioGroupItem value={quote.idRate.toString()} id={`rate-${quote.idRate}`} className="peer sr-only" disabled={hasGuide} />
                      <Label
                        htmlFor={`rate-${quote.idRate}`}
                        className={cn(
                          "flex cursor-pointer flex-col gap-2 rounded-lg border-2 p-3 transition-colors sm:flex-row sm:items-center sm:justify-between",
                          selectedRateId === quote.idRate ? "border-primary bg-accent/40" : "border-border hover:border-primary/40",
                          hasGuide && "cursor-not-allowed opacity-50",
                        )}
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          {info && (
                            <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded-md p-1.5" style={{ backgroundColor: info.color || "#FFFFFF" }}>
                              <Image src={info.logoUrl} alt={info.comercialName} width={56} height={28} className="h-full w-full object-contain" />
                            </span>
                          )}
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="flex flex-wrap items-center gap-2 font-semibold">
                              {quote.carrier}
                              <Badge variant="outline" className={cn("rounded-full border-transparent px-2 py-0 text-[11px] font-semibold text-primary", quote.isCOD ? "bg-tint-mint" : "bg-muted")}>
                                {quote.isCOD ? "Admite contra entrega" : "Solo pago anticipado"}
                              </Badge>
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {quote.product} · entrega en {quote.deliveryDays} {Number(quote.deliveryDays) === 1 ? "día" : "días"}
                            </span>
                          </span>
                        </span>
                        <span className="flex items-baseline gap-2 sm:flex-col sm:items-end sm:gap-0">
                          <span className="text-lg font-bold text-primary">{currencyFormatter(quote.totalCost)}</span>
                          <span className="text-xs text-muted-foreground">
                            flete {currencyFormatter(quote.flete)} · seguro {currencyFormatter(quote.minimumInsurance)}
                          </span>
                        </span>
                      </Label>
                    </div>
                  );
                })}
              </RadioGroup>
            </div>
          )}

          {rateId && !hasGuide && (
            <Alert>
              <Check className="h-4 w-4 text-success" aria-hidden="true" />
              <AlertDescription>
                Tarifa guardada{carrierName ? ` con ${carrierName}` : ""}: {currencyFormatter(Number(form.getValues("shipping.cost") ?? 0))}. La guía se crea al marcar el pedido como pagado.
              </AlertDescription>
            </Alert>
          )}
        </div>
      )}

      {provider === ShippingProvider.MANUAL && (
        <div className="flex flex-col gap-4 rounded-lg bg-muted/50 p-4">
          <BoxSelect id="caja-manual" boxes={boxes} value={boxId} onChange={(value) => form.setValue("shipping.boxId", value === "auto" ? undefined : value, { shouldDirty: true })} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="shipping.carrierName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Transportadora</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: Servientrega, TCC, Coordinadora" disabled={loading} {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="shipping.trackingCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de guía</FormLabel>
                  <FormControl>
                    <Input placeholder="Ej: SER123456789" disabled={loading} {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="shipping.trackingUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Enlace de seguimiento</FormLabel>
                  <FormControl>
                    <Input placeholder="https://…" inputMode="url" disabled={loading} {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="shipping.guideUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Enlace de la guía (PDF)</FormLabel>
                  <FormControl>
                    <Input placeholder="https://…" inputMode="url" disabled={loading} {...field} value={field.value || ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="shipping.cost"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Costo del envío</FormLabel>
                  <FormControl>
                    <CurrencyInput placeholder="$ 15.000" disabled={loading} value={field.value} onChange={field.onChange} />
                  </FormControl>
                  <FormDescription>Lo que paga el cliente por el envío.</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="shipping.status"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Estado del envío</FormLabel>
                  <Select disabled={loading} onValueChange={field.onChange} value={field.value} defaultValue={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Elige un estado" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(shippingOptions).map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="shipping.deliveryDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Días de entrega</FormLabel>
                  <FormControl>
                    <CountInput min={0} disabled={loading} value={Number(field.value || 0)} onChange={field.onChange} ariaLabel="Días de entrega" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="shipping.estimatedDeliveryDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Entrega estimada</FormLabel>
                  <FormControl>
                    <DatePicker name={field.name} control={form.control} disabled={loading} placeholder="Elige una fecha" />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="shipping.isCOD"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-md border bg-white p-3 sm:col-span-2">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={(checked) => {
                        field.onChange(checked);
                        if (checked) form.setValue("payment.method", PaymentMethod.COD, { shouldDirty: true });
                        else if (form.getValues("payment.method") === PaymentMethod.COD) form.setValue("payment.method", PaymentMethod.BankTransfer, { shouldDirty: true });
                      }}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Pago contra entrega</FormLabel>
                    <FormDescription>La transportadora recauda al entregar; el método de pago cambia a contra entrega.</FormDescription>
                  </div>
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="shipping.notes"
              render={({ field }) => (
                <FormItem className="sm:col-span-2">
                  <FormLabel>Notas del envío</FormLabel>
                  <FormControl>
                    <Textarea disabled={loading} rows={2} placeholder="Ej: Entregar en la portería" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          {carrierInfo && (
            <div className="flex items-center gap-3 rounded-md border bg-white p-3">
              <span className="flex h-10 w-16 shrink-0 items-center justify-center rounded-md p-1.5" style={{ backgroundColor: carrierInfo.color || "#FFFFFF" }}>
                <Image src={carrierInfo.logoUrl} alt={carrierInfo.comercialName} width={56} height={28} className="h-full w-full object-contain" />
              </span>
              <span className="text-sm font-medium">{carrierInfo.comercialName}</span>
            </div>
          )}
        </div>
      )}

      {children}
    </SectionCard>
  );
}
