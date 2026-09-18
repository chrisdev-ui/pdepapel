"use client";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Label } from "@/components/ui/label";
import { RadioGroup } from "@/components/ui/radio-group";
import { TintBadge } from "@/components/ui/tint-badge";
import { currencyFormatter } from "@/lib/utils";
import { ShippingProvider, type Box } from "@prisma/client";
import {
  AlertTriangle,
  Check,
  Clock,
  Loader2,
  RefreshCw,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

import type { GetOrderResult } from "../../../server/get-order";
import type { OrderFormValues, ShippingQuote } from "../schema";
import { BoxSelect } from "./box-select";
import { GuidePanel } from "./guide-panel";
import {
  describeRequote,
  formatRemaining,
  groupQuotes,
  pickAfterRequote,
  QUOTE_TTL_MS,
  type RequoteNotice,
} from "./quotes";
import { RateOption } from "./rate-option";

interface EnvioClickBlockProps {
  storeId: string;
  boxes: Box[];
  initialData: GetOrderResult["order"];
  loading: boolean;
  loadingQuotes: boolean;
  shippingQuotes: ShippingQuote[];
  quotedAt: Date | null;
  recommendedBox: {
    name: string;
    width: number;
    height: number;
    length: number;
  } | null;
  onGetShippingQuotes: (options?: {
    silent?: boolean;
  }) => Promise<ShippingQuote[] | null>;
  onSelectRate: (quote: ShippingQuote, options?: { silent?: boolean }) => void;
  onDiscard: () => void;
  discarding: boolean;
  setCOD: (checked: boolean) => void;
}

/**
 * EnvioClick: cotiza sola en cuanto hay ciudad y productos, agrupa por
 * transportadora (la más barata primero) y avisa cuando una recotización
 * cambia lo que estaba elegido. La guía se crea abajo, en un solo botón.
 */
export function EnvioClickBlock({
  storeId,
  boxes,
  initialData,
  loading,
  loadingQuotes,
  shippingQuotes,
  quotedAt,
  recommendedBox,
  onGetShippingQuotes,
  onSelectRate,
  onDiscard,
  discarding,
  setCOD,
}: EnvioClickBlockProps) {
  const form = useFormContext<OrderFormValues>();
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
  const rateId = useWatch({ control: form.control, name: "envioClickIdRate" });
  const savedCost = useWatch({ control: form.control, name: "shipping.cost" });

  const hasGuide = Boolean(initialData?.shipping?.envioClickIdOrder);
  const savedRateId = initialData?.shipping?.envioClickIdRate ?? null;
  const [showAllRates, setShowAllRates] = useState(false);
  const [notice, setNotice] = useState<RequoteNotice | null>(null);
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

  // Destino, contenido, forma de pago y caja: si cambia, la cotización de
  // antes ya no sirve y se pide otra sola (con un respiro para no cotizar por
  // cada tecla).
  const quoteKey = `${daneCode ?? ""}|${(address ?? "").trim()}|${itemsKey}|${isCOD ? "cod" : "pre"}|${boxId ?? "auto"}`;
  const quotedKey = useRef<string | null>(savedRateId ? quoteKey : null);
  const selectedCarrier = useRef<string | null>(carrierName || null);
  useEffect(() => {
    if (carrierName) selectedCarrier.current = carrierName;
  }, [carrierName]);

  const applyRequote = (quotes: ShippingQuote[]) => {
    const pick = pickAfterRequote(quotes, selectedCarrier.current);
    if (!pick) return;
    setNotice(
      describeRequote(
        { carrier: selectedCarrier.current, cost: Number(savedCost ?? 0) },
        pick,
      ),
    );
    onSelectRate(pick, { silent: true });
  };

  useEffect(() => {
    if (hasGuide || !canQuote || loading) return;
    if (quotedKey.current === quoteKey) return;
    const handle = window.setTimeout(async () => {
      quotedKey.current = quoteKey;
      const quotes = await onGetShippingQuotes({ silent: true });
      if (!quotes) {
        quotedKey.current = null;
        return;
      }
      applyRequote(quotes);
    }, 700);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    hasGuide,
    canQuote,
    loading,
    quoteKey,
    onGetShippingQuotes,
    onSelectRate,
  ]);

  // Reloj de vencimiento: un minuto basta.
  useEffect(() => {
    if (!quotedAt && !savedRateId) return;
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, [quotedAt, savedRateId]);

  const grouped = useMemo(() => groupQuotes(shippingQuotes), [shippingQuotes]);
  const visibleQuotes = showAllRates
    ? [...grouped.primary, ...grouped.rest]
    : grouped.primary;

  const savedAt = initialData?.shipping?.updatedAt
    ? new Date(initialData.shipping.updatedAt).getTime()
    : null;
  const freshFrom = quotedAt
    ? quotedAt.getTime()
    : savedRateId && savedAt
      ? savedAt
      : null;
  const remainingMs =
    freshFrom !== null ? freshFrom + QUOTE_TTL_MS - now : null;
  const expired = remainingMs !== null && remainingMs <= 0;
  const selectedCost = Number(savedCost ?? 0);
  const selectedQuote = shippingQuotes.find((q) => q.idRate === rateId);
  const codMismatch = Boolean(isCOD && selectedQuote && !selectedQuote.isCOD);

  return (
    <div className="flex flex-col gap-4 rounded-lg bg-muted/50 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Se cotiza con
          </span>
          <span className="text-sm font-semibold text-primary">
            {city
              ? `${city}${form.getValues("department") ? `, ${form.getValues("department")}` : ""}`
              : "Sin ciudad"}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Caja
          </span>
          <span className="text-sm font-semibold text-primary">
            {recommendedBox
              ? `${recommendedBox.name} ${recommendedBox.width}×${recommendedBox.height}×${recommendedBox.length} · automática`
              : boxId
                ? "Elegida a mano"
                : "Automática"}
          </span>
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Contenido
          </span>
          <span className="text-sm font-semibold text-primary">
            {itemCount} {itemCount === 1 ? "producto" : "productos"}
          </span>
        </div>
      </div>

      {!hasGuide && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <BoxSelect
            id="caja-envioclick"
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
                    Se cotiza con recaudo y el pago cambia a contra entrega.
                  </FormDescription>
                </div>
              </FormItem>
            )}
          />
        </div>
      )}

      {!hasGuide && !canQuote && (
        <div className="rounded-md border border-dashed bg-white p-3 text-sm">
          <p className="font-semibold text-primary">Para cotizar hace falta:</p>
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
                <a href="#productos" className="underline underline-offset-2">
                  Agrega al menos un producto
                </a>
              )}
            </li>
          </ul>
        </div>
      )}

      {!hasGuide && canQuote && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Label>Tarifas</Label>
              {remainingMs !== null && (
                <TintBadge
                  label={
                    expired
                      ? "Vencida: cotiza de nuevo"
                      : `Vigente ${formatRemaining(remainingMs)}`
                  }
                  tone={expired ? "pink" : "mint"}
                  className="gap-1"
                />
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="xs"
              onClick={async () => {
                quotedKey.current = quoteKey;
                const quotes = await onGetShippingQuotes();
                if (quotes) applyRequote(quotes);
              }}
              disabled={loadingQuotes || loading}
            >
              {loadingQuotes ? (
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Cotizar de nuevo
            </Button>
          </div>

          {notice && (
            <div className="flex items-start gap-2 rounded-md border border-[#F3E2A0] bg-tint-cream px-3 py-2 text-[13px] text-primary">
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0"
                aria-hidden="true"
              />
              <span className="flex-1">
                {notice.kind === "price" ? (
                  <>
                    La cotización se actualizó sola:{" "}
                    <strong>
                      {notice.carrier} pasó de {currencyFormatter(notice.from)}{" "}
                      a {currencyFormatter(notice.to)}
                    </strong>
                    . Sigue elegida; si prefieres otra, cámbiala abajo.
                  </>
                ) : (
                  <>
                    <strong>{notice.previous}</strong> ya no cubre este destino:
                    se eligió <strong>{notice.carrier}</strong> por{" "}
                    {currencyFormatter(notice.cost)}. Cámbiala abajo si
                    prefieres otra.
                  </>
                )}
              </span>
              <button
                type="button"
                aria-label="Entendido"
                onClick={() => setNotice(null)}
                className="shrink-0 rounded p-0.5 hover:bg-white/60"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          {loadingQuotes && shippingQuotes.length === 0 && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Cotizando con las transportadoras…
            </p>
          )}

          {shippingQuotes.length > 0 && (
            <>
              <RadioGroup
                value={rateId?.toString() || ""}
                onValueChange={(value) => {
                  const quote = shippingQuotes.find(
                    (q) => q.idRate === parseInt(value),
                  );
                  if (quote) {
                    setNotice(null);
                    onSelectRate(quote);
                  }
                }}
                className="flex flex-col gap-2"
                aria-label="Tarifas de envío"
              >
                {visibleQuotes.map((quote) => (
                  <RateOption
                    key={quote.idRate}
                    quote={quote}
                    selected={rateId === quote.idRate}
                    disabled={loading}
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
            </>
          )}
        </div>
      )}

      {rateId && !hasGuide && (
        <div className="flex flex-col gap-2 rounded-md border bg-white p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2">
            <Check
              className="mt-0.5 h-4 w-4 shrink-0 text-success"
              aria-hidden="true"
            />
            <span>
              Tarifa elegida: <strong>{carrierName || "transportadora"}</strong>{" "}
              · {currencyFormatter(selectedCost)}.{" "}
              <span className="text-muted-foreground">
                {savedRateId === rateId
                  ? "Guardada en el pedido."
                  : `Se guarda al pulsar «${initialData ? "Guardar cambios" : "Crear pedido"}».`}
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
            className="shrink-0 self-start text-destructive hover:text-destructive sm:self-auto"
            disabled={loading || discarding}
            onClick={onDiscard}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            Descartar tarifa
          </Button>
        </div>
      )}

      {rateId && !hasGuide && initialData && (
        <GuidePanel
          storeId={storeId}
          orderId={initialData.id}
          status={initialData.status}
          isCOD={Boolean(isCOD)}
          carrier={carrierName || "transportadora"}
          cost={selectedCost}
          saved={savedRateId === rateId}
          stale={savedRateId === rateId && !quotedAt && expired}
          guideError={initialData.shipping?.guideError}
          disabled={loading || discarding}
        />
      )}

      {remainingMs !== null && !hasGuide && rateId && (
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" aria-hidden="true" />
          Las tarifas de EnvioClick valen 2 horas.
        </span>
      )}
    </div>
  );
}
