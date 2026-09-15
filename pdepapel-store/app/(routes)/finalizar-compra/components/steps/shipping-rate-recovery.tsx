"use client";

import { PackageSearch, Truck } from "lucide-react";

import { Button } from "@/components/ui/button";
// `Currency` pinta un <div> y aquí los precios van dentro de <span> y de un
// <button>: anidarlo rompía la hidratación y con ella los clics del formulario.
import { currencyFormatter } from "@/lib/utils";

/** Una tarifa tal como la devuelve el API cuando hay que volver a elegir. */
export interface RecoveryRate {
  idRate: number;
  carrier: string;
  product: string;
  flete: number;
  minimumInsurance: number;
  totalCost: number;
  deliveryDays: number;
  isCOD: boolean;
}

export type ShippingRecovery =
  /** Sigue estando la misma transportadora, pero por otro precio. */
  | { kind: "changed"; rate: RecoveryRate; previousCost: number }
  /** Esa transportadora ya no llega; estas sí. */
  | { kind: "unavailable"; alternatives: RecoveryRate[] };

/**
 * Cuando la cotización de envío se queda vieja.
 *
 * La cotización dura dos horas. Quien se toma su tiempo en el checkout —mirar
 * el carrito, buscar la tarjeta, preguntarle a alguien— se la encuentra
 * vencida, y al volver a cotizar el precio puede haber cambiado o la
 * transportadora puede haber dejado de cubrir la dirección.
 *
 * Antes eso era un error sin salida y la compra se perdía ahí. Aquí se
 * resuelve en el mismo sitio: sin recargar, sin volver a escribir la
 * dirección y sin tocar el carrito. Un botón y sigue.
 */
export function ShippingRateRecovery({
  recovery,
  onConfirm,
  onChooseAnother,
  isSubmitting,
}: {
  recovery: ShippingRecovery;
  onConfirm: (rate: RecoveryRate) => void;
  onChooseAnother: () => void;
  isSubmitting: boolean;
}) {
  const esCambio = recovery.kind === "changed";

  return (
    <div
      className="space-y-3 rounded-xl border border-amber-300 bg-kawaii-yellow-light/60 p-4 text-sm"
      role="alert"
      aria-live="polite"
      data-testid="shipping-rate-recovery"
    >
      <p className="flex items-start gap-2 text-amber-900">
        {esCambio ? (
          <Truck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        ) : (
          <PackageSearch className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        <span>
          {esCambio ? (
            <>
              <strong>El costo del envío cambió mientras comprabas.</strong> Tu
              pedido sigue completo y no se ha cobrado nada; solo confirma el
              nuevo valor para terminar.
            </>
          ) : (
            <>
              <strong>
                La transportadora que elegiste ya no llega a tu dirección.
              </strong>{" "}
              Tu pedido sigue completo y no se ha cobrado nada; elige otra y
              seguimos.
            </>
          )}
        </span>
      </p>

      {esCambio ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-background p-3">
            <span className="min-w-0 flex-1">
              <span className="block font-semibold">
                {recovery.rate.carrier}
              </span>
              <span className="text-muted-foreground">
                {recovery.rate.product}
                {recovery.rate.deliveryDays > 0
                  ? ` · llega en ${recovery.rate.deliveryDays} ${recovery.rate.deliveryDays === 1 ? "día" : "días"}`
                  : ""}
              </span>
            </span>
            <span className="flex items-baseline gap-2">
              {recovery.previousCost > 0 && (
                <span className="font-quicksand text-sm text-muted-foreground line-through">
                  {currencyFormatter.format(recovery.previousCost)}
                </span>
              )}
              <span className="font-quicksand text-base font-semibold">
                {currencyFormatter.format(recovery.rate.totalCost)}
              </span>
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              className="h-11 flex-1 rounded-full sm:flex-none"
              disabled={isSubmitting}
              onClick={() => onConfirm(recovery.rate)}
            >
              {isSubmitting ? "Confirmando…" : "Confirmar y continuar"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="h-11 flex-1 rounded-full sm:flex-none"
              disabled={isSubmitting}
              onClick={onChooseAnother}
            >
              Elegir otro envío
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {recovery.alternatives.length > 0 ? (
            <ul className="space-y-2">
              {recovery.alternatives.map((rate) => (
                <li key={rate.idRate}>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => onConfirm(rate)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg bg-background p-3 text-left transition hover:bg-kawaii-mint-light/40 disabled:opacity-60"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{rate.carrier}</span>
                      <span className="text-muted-foreground">
                        {rate.product}
                        {rate.deliveryDays > 0
                          ? ` · llega en ${rate.deliveryDays} ${rate.deliveryDays === 1 ? "día" : "días"}`
                          : ""}
                      </span>
                    </span>
                    <span className="font-quicksand text-base font-semibold">
                      {currencyFormatter.format(rate.totalCost)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-lg bg-background p-3 text-muted-foreground">
              Por ahora no tenemos otra transportadora para esa dirección.
              Vuelve al paso de entrega y revisa los datos, o escríbenos y lo
              resolvemos contigo.
            </p>
          )}
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full rounded-full sm:w-auto"
            disabled={isSubmitting}
            onClick={onChooseAnother}
          >
            Volver a elegir el envío
          </Button>
        </div>
      )}
    </div>
  );
}
