"use client";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CurrencyInput } from "@/components/ui/currency-input";
import { DateField } from "@/components/ui/date-field";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioCards } from "@/components/ui/radio-cards";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StockQuantityInput } from "@/components/ui/stock-quantity-input";
import { Textarea } from "@/components/ui/textarea";
import { shippingOptions } from "@/constants";
import { getCarrierInfo, SHIPPING_QUOTE_CACHE } from "@/constants/shipping";
import { cn, currencyFormatter } from "@/lib/utils";
import { PaymentMethod, ShippingProvider, type Box } from "@prisma/client";
import { format, parseISO } from "date-fns";
import {
  Check,
  Clock,
  Loader2,
  RefreshCw,
  Store,
  Trash2,
  Truck,
} from "lucide-react";
import Image from "next/image";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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
  /** Momento en que llegaron las tarifas de arriba (para el aviso de vencimiento). */
  quotedAt: Date | null;
  selectedRateId: number | null;
  recommendedBox: {
    name: string;
    width: number;
    height: number;
    length: number;
  } | null;
  /** `silent`: disparo automático; no regaña por datos incompletos. */
  onGetShippingQuotes: (options?: {
    silent?: boolean;
  }) => Promise<ShippingQuote[] | null>;
  onSelectRate: (quote: ShippingQuote, options?: { silent?: boolean }) => void;
  /** Descarta la tarifa elegida: en el formulario y, si ya estaba guardada, en el servidor. */
  onDiscardRate: () => Promise<void> | void;
  /** Estado real del envío (guía, seguimiento): se muestra debajo de la configuración. */
  children?: ReactNode;
}

const QUOTE_TTL_MS = SHIPPING_QUOTE_CACHE.TTL_MS;

/** Tarifas ordenadas por precio; `primary` = la más barata de cada transportadora. */
function groupQuotes(quotes: ShippingQuote[]) {
  const sorted = [...quotes].sort((a, b) => a.totalCost - b.totalCost);
  const seen = new Set<string>();
  const primary: ShippingQuote[] = [];
  const rest: ShippingQuote[] = [];
  for (const quote of sorted) {
    if (seen.has(quote.carrier)) rest.push(quote);
    else {
      seen.add(quote.carrier);
      primary.push(quote);
    }
  }
  return { primary, rest };
}

function formatRemaining(ms: number) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes >= 60) {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return m ? `${h} h ${m} min` : `${h} h`;
  }
  return `${minutes} min`;
}

function BoxSelect({
  boxes,
  value,
  onChange,
  id,
  disabled,
}: {
  boxes: Box[];
  value?: string;
  onChange: (boxId: string) => void;
  id: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>Caja</Label>
      <Select
        value={value || "auto"}
        onValueChange={onChange}
        disabled={disabled}
      >
        <SelectTrigger id={id}>
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

function RateOption({
  quote,
  selected,
  disabled,
}: {
  quote: ShippingQuote;
  selected: boolean;
  disabled: boolean;
}) {
  const info = getCarrierInfo(quote.carrier);
  return (
    <div>
      <RadioGroupItem
        value={quote.idRate.toString()}
        id={`rate-${quote.idRate}`}
        className="peer sr-only"
        disabled={disabled}
      />
      <Label
        htmlFor={`rate-${quote.idRate}`}
        className={cn(
          "flex cursor-pointer flex-col gap-2 rounded-lg border-2 bg-white p-3 transition-colors sm:flex-row sm:items-center sm:justify-between",
          selected
            ? "border-primary bg-accent/40"
            : "border-border hover:border-primary/40",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          {info && (
            <span
              className="flex h-10 w-16 shrink-0 items-center justify-center rounded-md p-1.5"
              style={{ backgroundColor: info.color || "#FFFFFF" }}
            >
              <Image
                src={info.logoUrl}
                alt={info.comercialName}
                width={56}
                height={28}
                className="h-full w-full object-contain"
              />
            </span>
          )}
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="flex flex-wrap items-center gap-2 font-semibold text-primary">
              {quote.carrier}
              <Badge
                variant="outline"
                className={cn(
                  "rounded-full border-transparent px-2 py-0 text-[11px] font-semibold text-primary",
                  quote.isCOD ? "bg-tint-mint" : "bg-muted",
                )}
              >
                {quote.isCOD ? "Admite contra entrega" : "Solo pago anticipado"}
              </Badge>
            </span>
            <span className="text-xs text-muted-foreground">
              {quote.product} · entrega en {quote.deliveryDays}{" "}
              {Number(quote.deliveryDays) === 1 ? "día" : "días"}
            </span>
          </span>
        </span>
        <span className="flex items-baseline gap-2 sm:flex-col sm:items-end sm:gap-0">
          <span className="text-lg font-bold text-primary">
            {currencyFormatter(quote.totalCost)}
          </span>
          <span className="text-xs text-muted-foreground">
            flete {currencyFormatter(quote.flete)} · seguro{" "}
            {currencyFormatter(quote.minimumInsurance)}
          </span>
        </span>
      </Label>
    </div>
  );
}

/**
 * Envío y empaque: una sola forma de decidir cómo llega el pedido. Con
 * EnvioClick la cotización sale sola en cuanto hay ciudad y productos, se
 * agrupa por transportadora (la más barata primero, ya elegida) y avisa
 * cuando vence. Los campos comunes (costo, estado, nota) se ven igual con
 * cualquier opción.
 */
export function ShippingSection({
  boxes,
  initialData,
  loading,
  loadingQuotes,
  shippingQuotes,
  quotedAt,
  selectedRateId,
  recommendedBox,
  onGetShippingQuotes,
  onSelectRate,
  onDiscardRate,
  children,
}: ShippingSectionProps) {
  const form = useFormContext<OrderFormValues>();
  const provider = useWatch({
    control: form.control,
    name: "shippingProvider",
  });
  const boxId = useWatch({ control: form.control, name: "shipping.boxId" });
  const city = useWatch({ control: form.control, name: "city" });
  const daneCode = useWatch({ control: form.control, name: "daneCode" });
  const address = useWatch({ control: form.control, name: "address" });
  const isCOD = useWatch({ control: form.control, name: "shipping.isCOD" });
  const items = useWatch({ control: form.control, name: "orderItems" });
  const carrierName = useWatch({
    control: form.control,
    name: "shipping.carrierName",
  });
  const courier = useWatch({ control: form.control, name: "shipping.courier" });
  const rateId = useWatch({ control: form.control, name: "envioClickIdRate" });
  const savedCost = useWatch({ control: form.control, name: "shipping.cost" });
  const hasGuide = Boolean(initialData?.shipping?.envioClickIdOrder);
  const savedRateId = initialData?.shipping?.envioClickIdRate ?? null;
  // Con «Otra transportadora» manda lo escrito; `courier` es lo que dejó una
  // tarifa de EnvioClick y no debe colarse aquí.
  const carrierInfo = getCarrierInfo(
    carrierName ||
      (provider === ShippingProvider.ENVIOCLICK ? courier : "") ||
      "",
  );
  const [showAllRates, setShowAllRates] = useState(false);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const itemCount = (items ?? []).reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0,
  );
  const itemsKey = (items ?? [])
    .map(
      (item) => `${item.productId ?? item.name}:${item.quantity}:${item.price}`,
    )
    .join("|");
  const canQuote = Boolean(city && daneCode) && itemCount > 0;

  // Una tarifa vale para un destino, un contenido y una forma de pago: la
  // clave resume eso. Si cambia, la cotización de antes ya no sirve y se pide
  // otra sola (con un respiro para no cotizar por cada tecla).
  const quoteKey = `${daneCode ?? ""}|${(address ?? "").trim()}|${itemsKey}|${isCOD ? "cod" : "pre"}|${boxId ?? "auto"}`;
  const quotedKey = useRef<string | null>(savedRateId ? quoteKey : null);
  const selectedCarrier = useRef<string | null>(carrierName || null);
  useEffect(() => {
    if (carrierName) selectedCarrier.current = carrierName;
  }, [carrierName]);

  useEffect(() => {
    if (
      provider !== ShippingProvider.ENVIOCLICK ||
      hasGuide ||
      !canQuote ||
      loading
    )
      return;
    if (quotedKey.current === quoteKey) return;
    const handle = window.setTimeout(async () => {
      quotedKey.current = quoteKey;
      const quotes = await onGetShippingQuotes({ silent: true });
      if (!quotes) {
        quotedKey.current = null;
        return;
      }
      const { primary } = groupQuotes(quotes);
      // Se conserva la transportadora que ya estaba elegida si sigue
      // cubriendo el destino; si no, la más barata.
      const keep = selectedCarrier.current
        ? primary.find((q) => q.carrier === selectedCarrier.current)
        : undefined;
      const pick = keep ?? primary[0];
      if (pick) onSelectRate(pick, { silent: true });
    }, 700);
    return () => window.clearTimeout(handle);
  }, [
    provider,
    hasGuide,
    canQuote,
    loading,
    quoteKey,
    onGetShippingQuotes,
    onSelectRate,
  ]);

  // Reloj de vencimiento: un minuto basta.
  useEffect(() => {
    if (!quotedAt) return;
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [quotedAt]);

  const grouped = useMemo(() => groupQuotes(shippingQuotes), [shippingQuotes]);
  const visibleQuotes = showAllRates
    ? [...grouped.primary, ...grouped.rest]
    : grouped.primary;
  const remainingMs = quotedAt ? quotedAt.getTime() + QUOTE_TTL_MS - now : null;
  const expired = remainingMs !== null && remainingMs <= 0;
  const savedAgoMs =
    savedRateId && !quotedAt && initialData?.shipping?.updatedAt
      ? now - new Date(initialData.shipping.updatedAt).getTime()
      : null;
  const selectedCost = Number(savedCost ?? 0);
  const selectedQuote = shippingQuotes.find((q) => q.idRate === rateId);
  const codMismatch = Boolean(isCOD && selectedQuote && !selectedQuote.isCOD);

  const setCOD = (checked: boolean) => {
    form.setValue("shipping.isCOD", checked, { shouldDirty: true });
    if (checked)
      form.setValue("payment.method", PaymentMethod.COD, { shouldDirty: true });
    else if (form.getValues("payment.method") === PaymentMethod.COD)
      form.setValue("payment.method", PaymentMethod.BankTransfer, {
        shouldDirty: true,
      });
  };

  const discard = async () => {
    setDiscarding(true);
    try {
      await onDiscardRate();
      quotedKey.current = null;
      selectedCarrier.current = null;
      setShowAllRates(false);
    } finally {
      setDiscarding(false);
      setDiscardOpen(false);
    }
  };

  const providerOptions = [
    {
      value: ShippingProvider.NONE,
      title: "Recoge en tienda",
      hint: "Sin transportadora; el cliente pasa por el pedido.",
      icon: <Store className="h-5 w-5 text-primary" aria-hidden="true" />,
    },
    {
      value: ShippingProvider.ENVIOCLICK,
      title: "EnvioClick",
      hint: "Cotiza sola, eliges transportadora y la guía se crea al pagar.",
      icon: (
        <Image
          src="https://www.envioclickpro.com.co/img/register/logo_solo.svg"
          alt=""
          width={20}
          height={20}
          className="h-5 w-5 object-contain"
        />
      ),
    },
    {
      value: ShippingProvider.MANUAL,
      title: "Otra transportadora",
      hint: "Registra guía y costo a mano.",
      icon: <Truck className="h-5 w-5 text-primary" aria-hidden="true" />,
    },
  ];

  const commonFields = (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <FormField
        control={form.control}
        name="shipping.cost"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Costo que paga el cliente</FormLabel>
            <FormControl>
              <CurrencyInput
                placeholder="$ 0"
                disabled={loading || hasGuide}
                value={field.value}
                onChange={field.onChange}
              />
            </FormControl>
            <FormDescription>
              {provider === ShippingProvider.NONE
                ? "Solo si se cobra algo por la entrega."
                : provider === ShippingProvider.ENVIOCLICK
                  ? "Lo llena la tarifa elegida; puedes cobrar otro valor al cliente."
                  : "Lo que se le cobra al cliente por el envío."}
            </FormDescription>
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
            <Select
              disabled={loading}
              onValueChange={field.onChange}
              value={field.value}
              defaultValue={field.value}
            >
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
        name="shipping.notes"
        render={({ field }) => (
          <FormItem className="sm:col-span-2">
            <FormLabel>Nota para el cliente</FormLabel>
            <FormControl>
              <Textarea
                disabled={loading}
                rows={2}
                placeholder={
                  provider === ShippingProvider.NONE
                    ? "Ej: Listo para recoger mañana después de las 2 p. m."
                    : "Ej: Entregar en la portería"
                }
                {...field}
                value={field.value ?? ""}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );

  return (
    <SectionCard
      id="envio"
      title="Envío y empaque"
      description={
        hasGuide
          ? `Guía de EnvioClick creada (${initialData?.shipping?.envioClickIdOrder}). La configuración ya no cambia.`
          : "Cómo llega el pedido. Con EnvioClick, la guía se crea al marcarlo pagado."
      }
    >
      <FormField
        control={form.control}
        name="shippingProvider"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <RadioCards<ShippingProvider>
                value={field.value}
                onChange={field.onChange}
                options={providerOptions}
                label="Tipo de envío"
                idPrefix="envio"
                disabled={loading || hasGuide}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {provider === ShippingProvider.ENVIOCLICK && (
        <div className="flex flex-col gap-4 rounded-lg bg-muted/50 p-4">
          {/* Resumen de lo que se cotiza; el envío responde a estos tres datos. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex min-w-0 flex-col gap-1 text-sm">
              <span className="font-semibold text-primary">
                {city
                  ? `${city}${form.getValues("department") ? `, ${form.getValues("department")}` : ""}`
                  : "Sin ciudad"}
              </span>
              <span className="text-xs text-muted-foreground">
                {itemCount} {itemCount === 1 ? "producto" : "productos"}
                {recommendedBox
                  ? ` · caja ${recommendedBox.name} (${recommendedBox.width}×${recommendedBox.height}×${recommendedBox.length} cm)`
                  : boxId
                    ? " · caja elegida a mano"
                    : " · caja automática"}
              </span>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <BoxSelect
                id="caja-envioclick"
                boxes={boxes}
                value={boxId}
                disabled={loading || hasGuide}
                onChange={(value) =>
                  form.setValue(
                    "shipping.boxId",
                    value === "auto" ? undefined : value,
                    { shouldDirty: true },
                  )
                }
              />
              {!hasGuide && (
                <Button
                  type="button"
                  variant="soft"
                  onClick={async () => {
                    quotedKey.current = quoteKey;
                    const quotes = await onGetShippingQuotes();
                    if (!quotes) return;
                    const { primary } = groupQuotes(quotes);
                    const keep = selectedCarrier.current
                      ? primary.find(
                          (q) => q.carrier === selectedCarrier.current,
                        )
                      : undefined;
                    const pick = keep ?? primary[0];
                    if (pick) onSelectRate(pick, { silent: true });
                  }}
                  disabled={loadingQuotes || loading || !canQuote}
                >
                  {loadingQuotes ? (
                    <Loader2
                      className="h-4 w-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  )}
                  Cotizar de nuevo
                </Button>
              )}
            </div>
          </div>

          {!hasGuide && (
            <FormField
              control={form.control}
              name="shipping.isCOD"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start gap-3 space-y-0 rounded-md border bg-white p-3">
                  <FormControl>
                    <Checkbox
                      checked={Boolean(field.value)}
                      disabled={loading}
                      onCheckedChange={(checked) => setCOD(Boolean(checked))}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Pago contra entrega</FormLabel>
                    <FormDescription>
                      Se cotiza con recaudo y el método de pago cambia a contra
                      entrega. Cada tarifa dice si la transportadora recauda.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          )}

          {!hasGuide && !canQuote && (
            <div className="rounded-md border border-dashed bg-white p-3 text-sm">
              <p className="font-semibold text-primary">
                Para cotizar hace falta:
              </p>
              <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                <li className="flex items-center gap-2">
                  {city && daneCode ? (
                    <Check
                      className="h-3.5 w-3.5 text-success"
                      aria-hidden="true"
                    />
                  ) : (
                    <span
                      className="h-3.5 w-3.5 rounded-full border"
                      aria-hidden="true"
                    />
                  )}
                  {city && daneCode ? (
                    "Ciudad del cliente"
                  ) : (
                    <a href="#cliente" className="underline underline-offset-2">
                      Elige la ciudad del cliente con el buscador
                    </a>
                  )}
                </li>
                <li className="flex items-center gap-2">
                  {itemCount > 0 ? (
                    <Check
                      className="h-3.5 w-3.5 text-success"
                      aria-hidden="true"
                    />
                  ) : (
                    <span
                      className="h-3.5 w-3.5 rounded-full border"
                      aria-hidden="true"
                    />
                  )}
                  {itemCount > 0 ? (
                    "Al menos un producto"
                  ) : (
                    <a
                      href="#productos"
                      className="underline underline-offset-2"
                    >
                      Agrega al menos un producto
                    </a>
                  )}
                </li>
              </ul>
            </div>
          )}

          {!hasGuide && loadingQuotes && shippingQuotes.length === 0 && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Cotizando con las transportadoras…
            </p>
          )}

          {!hasGuide && shippingQuotes.length > 0 && (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label>Transportadora</Label>
                {remainingMs !== null && (
                  <Badge
                    variant="outline"
                    className={cn(
                      "gap-1 rounded-full font-normal",
                      expired
                        ? "border-destructive/40 text-destructive"
                        : "text-muted-foreground",
                    )}
                  >
                    <Clock className="h-3 w-3" aria-hidden="true" />
                    {expired
                      ? "Tarifas vencidas: cotiza de nuevo"
                      : `Vencen en ${formatRemaining(remainingMs)}`}
                  </Badge>
                )}
              </div>
              <RadioGroup
                value={selectedRateId?.toString() || ""}
                onValueChange={(value) => {
                  const quote = shippingQuotes.find(
                    (q) => q.idRate === parseInt(value),
                  );
                  if (quote) onSelectRate(quote);
                }}
                className="flex flex-col gap-2"
                aria-label="Tarifas de envío"
              >
                {visibleQuotes.map((quote) => (
                  <RateOption
                    key={quote.idRate}
                    quote={quote}
                    selected={selectedRateId === quote.idRate}
                    disabled={hasGuide || loading}
                  />
                ))}
              </RadioGroup>
              {grouped.rest.length > 0 && (
                <Button
                  type="button"
                  variant="link"
                  size="xs"
                  className="h-auto self-start p-0"
                  onClick={() => setShowAllRates((v) => !v)}
                >
                  {showAllRates
                    ? "Ver solo la mejor de cada transportadora"
                    : `Ver las ${grouped.rest.length} tarifas restantes`}
                </Button>
              )}
            </div>
          )}

          {rateId && !hasGuide && (
            <div className="flex flex-col gap-2 rounded-md border bg-white p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2">
                <Check
                  className="h-4 w-4 shrink-0 text-success"
                  aria-hidden="true"
                />
                <span>
                  Tarifa elegida:{" "}
                  <strong>{carrierName || "transportadora"}</strong> ·{" "}
                  {currencyFormatter(selectedCost)}.{" "}
                  <span className="text-muted-foreground">
                    {savedRateId === rateId
                      ? "Ya está guardada; la guía se crea al marcar el pedido pagado."
                      : `Se guarda al pulsar «${initialData ? "Guardar cambios" : "Crear pedido"}».`}
                    {savedAgoMs !== null && savedAgoMs > QUOTE_TTL_MS
                      ? " Lleva más de 2 h guardada: cotiza de nuevo antes de crear la guía."
                      : ""}
                  </span>
                  {codMismatch && (
                    <span className="mt-1 block text-destructive">
                      Según EnvioClick, {carrierName} no recauda contra entrega:
                      elige una tarifa que sí lo haga o quita el pago contra
                      entrega.
                    </span>
                  )}
                </span>
              </p>
              <Button
                type="button"
                variant="ghost"
                size="xs"
                className="shrink-0 text-destructive hover:text-destructive"
                disabled={loading || discarding}
                onClick={() => (savedRateId ? setDiscardOpen(true) : discard())}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                Descartar tarifa
              </Button>
            </div>
          )}
        </div>
      )}

      {provider === ShippingProvider.MANUAL && (
        <div className="flex flex-col gap-4 rounded-lg bg-muted/50 p-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="shipping.carrierName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel isRequired>Transportadora</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej: Servientrega, TCC, Coordinadora"
                      disabled={loading}
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <BoxSelect
              id="caja-manual"
              boxes={boxes}
              value={boxId}
              disabled={loading}
              onChange={(value) =>
                form.setValue(
                  "shipping.boxId",
                  value === "auto" ? undefined : value,
                  { shouldDirty: true },
                )
              }
            />
            <FormField
              control={form.control}
              name="shipping.trackingCode"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Número de guía</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ej: SER123456789"
                      disabled={loading}
                      {...field}
                      value={field.value || ""}
                    />
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
                    <Input
                      placeholder="https://…"
                      inputMode="url"
                      disabled={loading}
                      {...field}
                      value={field.value || ""}
                    />
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
                    <Input
                      placeholder="https://…"
                      inputMode="url"
                      disabled={loading}
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
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
                    <div className="flex">
                      <StockQuantityInput
                        min={0}
                        max={60}
                        disabled={loading}
                        value={Number(field.value || 0)}
                        onChange={field.onChange}
                        ariaLabel="Días de entrega"
                        className="sm:max-w-[180px]"
                      />
                    </div>
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
                    <DateField
                      id="envio-entrega-estimada"
                      value={
                        field.value ? format(field.value, "yyyy-MM-dd") : ""
                      }
                      onChange={(iso) =>
                        field.onChange(iso ? parseISO(iso) : undefined)
                      }
                      disabled={loading}
                      placeholder="Elige una fecha"
                      clearable
                      aria-label="Entrega estimada"
                    />
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
                      checked={Boolean(field.value)}
                      disabled={loading}
                      onCheckedChange={(checked) => setCOD(Boolean(checked))}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel>Pago contra entrega</FormLabel>
                    <FormDescription>
                      La transportadora recauda al entregar; el método de pago
                      cambia a contra entrega.
                    </FormDescription>
                  </div>
                </FormItem>
              )}
            />
          </div>
          {carrierInfo && (
            <div className="flex items-center gap-3 rounded-md border bg-white p-3">
              <span
                className="flex h-10 w-16 shrink-0 items-center justify-center rounded-md p-1.5"
                style={{ backgroundColor: carrierInfo.color || "#FFFFFF" }}
              >
                <Image
                  src={carrierInfo.logoUrl}
                  alt={carrierInfo.comercialName}
                  width={56}
                  height={28}
                  className="h-full w-full object-contain"
                />
              </span>
              <span className="text-sm font-medium">
                {carrierInfo.comercialName}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Los mismos tres campos con cualquier tipo de envío. */}
      {commonFields}

      {children}

      <AlertDialog
        open={discardOpen}
        onOpenChange={(open) => !open && !discarding && setDiscardOpen(false)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar la tarifa guardada?</AlertDialogTitle>
            <AlertDialogDescription>
              Se quita la cotización del pedido y el flete deja de sumarse al
              total. Después se cotiza de nuevo con las tarifas del momento.
              Solo es posible mientras no exista una guía.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={discarding}>Volver</AlertDialogCancel>
            <AlertDialogAction
              onClick={discard}
              disabled={discarding}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {discarding ? "Descartando…" : "Descartar tarifa"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SectionCard>
  );
}
