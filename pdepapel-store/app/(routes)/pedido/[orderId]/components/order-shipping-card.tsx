"use client";

import { Check, Copy, ExternalLink, MapPin, RefreshCw, Store, Truck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { formatPhoneNumber } from "react-phone-number-input";

import { Button } from "@/components/ui/button";
import { formatOrderDate } from "@/lib/order-dates";
import { getShippingStatusLabel, getTrackingUrl } from "@/lib/order-status";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import type { Order, ShippingTrackingEvent } from "@/types";
import { Courier } from "./courier";
import { OrderSection } from "./order-section";

interface OrderShippingCardProps {
  order: Order;
  /** Whether the customer has paid: the guide only appears after that. */
  awaitingPayment: boolean;
  trackingEvents: ShippingTrackingEvent[];
  canRefreshTracking: boolean;
  isRefreshingTracking: boolean;
  onRefreshTracking: () => void;
}

const normalizeText = (text: string): string => {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
};

function CopyTrackingCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (insecure context): the code is still selectable.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Guía copiada" : "Copiar número de guía"}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kawaii-pink print:hidden"
    >
      {copied ? (
        <Check aria-hidden="true" className="h-4 w-4 text-success" />
      ) : (
        <Copy aria-hidden="true" className="h-4 w-4" />
      )}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="m-0 text-sm text-foreground">{children}</dd>
    </div>
  );
}

export function OrderShippingCard({
  order,
  awaitingPayment,
  trackingEvents,
  canRefreshTracking,
  isRefreshingTracking,
  onRefreshTracking,
}: OrderShippingCardProps) {
  const shipping = order.shipping;
  const isPickup = shipping?.provider === "NONE";
  const trackingUrl = getTrackingUrl(shipping);
  const carrierName = shipping?.carrierName || shipping?.courier || null;
  const eta = shipping?.estimatedDeliveryDate
    ? formatOrderDate(shipping.estimatedDeliveryDate, "day")
    : shipping?.deliveryDays
      ? `${shipping.deliveryDays} ${Number(shipping.deliveryDays) === 1 ? "día hábil" : "días hábiles"} después del despacho`
      : null;

  const address = (
    <address className="not-italic">
      <p className="font-semibold">{order.fullName}</p>
      {order.company && <p className="text-muted-foreground">{order.company}</p>}
      <p>
        {order.address}
        {order.address2 ? `, ${order.address2}` : ""}
      </p>
      {order.neighborhood && <p>Barrio {order.neighborhood}</p>}
      <p>
        {[order.city, order.department].filter(Boolean).join(", ")}
      </p>
      {order.addressReference && (
        <p className="mt-1 text-sm text-muted-foreground">
          {order.addressReference}
        </p>
      )}
      {order.phone && (
        <p className="mt-1 text-sm text-muted-foreground">
          {formatPhoneNumber(order.phone) || order.phone}
        </p>
      )}
    </address>
  );

  if (isPickup) {
    return (
      <OrderSection
        id="pedido-envio"
        title="Retiro en tienda"
        icon={Store}
        tint="bg-kawaii-yellow-light"
      >
        <p className="text-sm text-muted-foreground">
          Este pedido se retira en persona. Te avisamos por WhatsApp o correo
          cuando esté listo.
        </p>
        <dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Estado">{getShippingStatusLabel(shipping?.status)}</Field>
          <Field label="A nombre de">{address}</Field>
        </dl>
      </OrderSection>
    );
  }

  return (
    <OrderSection
      id="pedido-envio"
      title="Envío"
      icon={Truck}
      tint="bg-kawaii-blue-light"
      action={
        <Link
          href={STOREFRONT_ROUTES.shippingPolicy}
          className="text-sm font-semibold text-blue-yankees underline underline-offset-4 print:hidden"
        >
          Política de envíos
        </Link>
      }
    >
      {carrierName && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/50 p-3">
          <Courier name={carrierName} service={shipping?.productName} />
          {trackingUrl && (
            <Button
              asChild
              variant="outline"
              size="sm"
              className="gap-2 rounded-full border-[1.5px] border-blue-yankees font-sans font-semibold text-blue-yankees print:hidden"
            >
              <a href={trackingUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink aria-hidden="true" className="h-4 w-4" />
                Rastrear en {carrierName}
              </a>
            </Button>
          )}
        </div>
      )}

      <dl className="grid gap-4 sm:grid-cols-2">
        {shipping?.trackingCode ? (
          <Field label="Número de guía">
            <span className="inline-flex items-center gap-1 font-quicksand font-semibold">
              <span className="select-all">{shipping.trackingCode}</span>
              <CopyTrackingCode code={shipping.trackingCode} />
            </span>
          </Field>
        ) : (
          <Field label="Número de guía">
            <span className="text-muted-foreground">
              {awaitingPayment
                ? "Aparece aquí cuando confirmemos el pago."
                : "Te lo enviamos por correo cuando el pedido salga."}
            </span>
          </Field>
        )}
        <Field label="Estado del envío">
          {getShippingStatusLabel(shipping?.status)}
        </Field>
        {eta && <Field label="Entrega estimada">{eta}</Field>}
        <Field label="Dirección de entrega">{address}</Field>
      </dl>

      {(trackingEvents.length > 0 || canRefreshTracking) && (
        <div className="flex flex-col gap-3 border-t border-border pt-4 print:hidden">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-sans text-sm font-bold text-blue-yankees">
              Historial del envío
              {trackingEvents.length > 0 && ` (${trackingEvents.length})`}
            </h3>
            {canRefreshTracking && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={onRefreshTracking}
                disabled={isRefreshingTracking}
                aria-busy={isRefreshingTracking}
                className="gap-2 rounded-full font-sans font-semibold text-blue-yankees"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={isRefreshingTracking ? "h-4 w-4 animate-spin" : "h-4 w-4"}
                />
                {isRefreshingTracking ? "Consultando…" : "Actualizar rastreo"}
              </Button>
            )}
          </div>
          {trackingEvents.length > 0 ? (
            <ol className="flex max-h-72 flex-col gap-2 overflow-y-auto pr-1 text-sm">
              {trackingEvents.map((event, index) => (
                <li key={event.id} className="flex gap-3">
                  <time
                    dateTime={event.timestamp}
                    className="w-28 shrink-0 font-quicksand text-muted-foreground"
                  >
                    {formatOrderDate(event.timestamp, "short")}
                  </time>
                  <span className={index === 0 ? "font-semibold" : undefined}>
                    {normalizeText(event.description)}
                    {event.location && (
                      <span className="text-muted-foreground"> · {event.location}</span>
                    )}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted-foreground">
              Consulta el último movimiento reportado por la transportadora.
            </p>
          )}
        </div>
      )}

      {!carrierName && !shipping?.trackingCode && (
        <p className="flex items-start gap-2 text-sm text-muted-foreground">
          <MapPin aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />
          Enviamos con transportadora a toda Colombia. Te avisamos por correo
          cuando el paquete salga.
        </p>
      )}
    </OrderSection>
  );
}
