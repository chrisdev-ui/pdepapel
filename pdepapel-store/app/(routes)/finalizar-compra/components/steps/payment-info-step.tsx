import { Button } from "@/components/ui/button";
import { Currency } from "@/components/ui/currency";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { PaymentMethodSelector } from "@/components/ui/payment-method-selector";
import { PresaleCartNotice } from "@/components/presale-cart-notice";
import { WelcomeBenefitCard } from "@/components/welcome-benefit-card";
import { PaymentMethod } from "@/constants";
import { useCart } from "@/hooks/use-cart";
import { isPresaleItem } from "@/lib/purchasable-units";
import { AlertTriangle, MapPin, UserRound } from "lucide-react";
import { useId } from "react";
import { UseFormReturn } from "react-hook-form";
import { CouponField } from "../coupon-field";
import { CheckoutFormValue, CouponState } from "../multi-step-checkout-form";

export interface StockConflictItem {
  productId: string;
  name: string;
  requested: number;
  available: number;
}

import {
  ShippingRateRecovery,
  type RecoveryRate,
  type ShippingRecovery,
} from "./shipping-rate-recovery";

interface PaymentInfoStepProps {
  form: UseFormReturn<CheckoutFormValue>;
  isLoading?: boolean;
  couponState: CouponState;
  setCouponState: React.Dispatch<React.SetStateAction<CouponState>>;
  validateCouponMutate: (variables: { code: string; subtotal: number }) => void;
  validateCouponStatus: "idle" | "pending" | "success" | "error";
  subtotal: number;
  shippingCost: number;
  freeShipping: boolean;
  onEditStep: (step: number) => void;
  onApplyWelcomeBenefit: (code: string) => void;
  stockConflicts: StockConflictItem[];
  onAdjustStock: (productId: string, quantity: number) => void;
  onDismissStockConflicts: () => void;
  /** Cotización de envío vencida: se resuelve sin salir de aquí. */
  shippingRecovery: ShippingRecovery | null;
  onConfirmShippingRate: (rate: RecoveryRate) => void;
  onChooseAnotherShipping: () => void;
  isSubmittingRecovery: boolean;
}

const formatDeliveryDays = (days?: number) => {
  if (!days || days <= 0) return null;
  return days === 1 ? "1 día hábil" : `${days} días hábiles`;
};

export const PaymentInfoStep = ({
  form,
  isLoading,
  couponState,
  setCouponState,
  validateCouponMutate,
  validateCouponStatus,
  subtotal,
  shippingCost,
  freeShipping,
  onEditStep,
  onApplyWelcomeBenefit,
  stockConflicts,
  onAdjustStock,
  onDismissStockConflicts,
  shippingRecovery,
  onConfirmShippingRate,
  onChooseAnotherShipping,
  isSubmittingRecovery,
}: PaymentInfoStepProps) => {
  const cartItems = useCart((state) => state.items);
  const isCODShipment = form.watch("shipping.isCOD");
  const shippingOptionType = form.watch("shippingOptionType");
  const values = form.getValues();
  const paymentLabelId = useId();
  // Regla 1 de la preventa: se paga al reservar. Contra entrega no cobraría
  // hasta que el paquete llegue —semanas después—, así que el pedido quedaría
  // sin pagar y sin cupo. La API lo rechaza también; aquí se evita que la
  // clienta llegue hasta el botón para que se lo nieguen.
  const hasPresale = cartItems.some((item) => isPresaleItem(item));
  const codAvailable = Boolean(isCODShipment) && !hasPresale;

  const deliveryDays = formatDeliveryDays(values.shipping?.deliveryDays);
  const shippingLine =
    shippingOptionType === "ENVIOCLICK"
      ? [values.shipping?.carrierName, deliveryDays].filter(Boolean).join(" · ")
      : values.shipping?.carrierName;

  const hasPaymentAlert =
    Boolean(shippingRecovery) || stockConflicts.length > 0;
  const isAwaitingOrderAnswer = Boolean(isLoading) || isSubmittingRecovery;

  return (
    <div className="space-y-6 duration-500 animate-in fade-in-0 slide-in-from-right-4">
      <div className="space-y-1">
        <h2 className="font-serif text-2xl font-bold text-blue-yankees sm:text-3xl">
          Pago y confirmación
        </h2>
        <p className="text-sm text-muted-foreground">
          Elige cómo pagar y revisa que todo esté bien.
        </p>
      </div>

      {/* Both of these land after the order request comes back. The slot opens
          the moment the submit starts, so the answer drops into space that
          already exists instead of pushing the payment options down. It is not
          rendered at rest, or the parent's space-y would leave a gap. */}
      {(hasPaymentAlert || isAwaitingOrderAnswer) && (
        <div className={hasPaymentAlert ? undefined : "min-h-[260px]"}>
          {shippingRecovery && (
            <ShippingRateRecovery
              recovery={shippingRecovery}
              onConfirm={onConfirmShippingRate}
              onChooseAnother={onChooseAnotherShipping}
              isSubmitting={isSubmittingRecovery}
            />
          )}

          {stockConflicts.length > 0 && (
            <div
              className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm"
              role="alert"
            >
              <p className="flex items-start gap-2 text-destructive">
                <AlertTriangle
                  className="mt-0.5 h-4 w-4 shrink-0"
                  aria-hidden="true"
                />
                <span>
                  <strong>
                    Se agotó parte de tu pedido mientras comprabas.
                  </strong>{" "}
                  Ajusta las cantidades para continuar; no se creó ningún pedido
                  ni se cobró nada.
                </span>
              </p>
              <ul className="space-y-2">
                {stockConflicts.map((item) => (
                  <li
                    key={item.productId}
                    className="flex flex-wrap items-center gap-2 rounded-lg bg-background p-3"
                  >
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="block font-semibold">{item.name}</span>
                      <span className="text-muted-foreground">
                        Pediste {item.requested} ·{" "}
                        {item.available > 0
                          ? `queda${item.available === 1 ? "" : "n"} ${item.available}`
                          : "ya no hay unidades"}
                      </span>
                    </span>
                    {item.available > 0 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 rounded-full"
                        onClick={() =>
                          onAdjustStock(item.productId, item.available)
                        }
                      >
                        Dejar {item.available}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-9 rounded-full"
                      onClick={() => onAdjustStock(item.productId, 0)}
                    >
                      Quitar
                    </Button>
                  </li>
                ))}
              </ul>
              <Button
                type="button"
                size="sm"
                className="h-10 rounded-full"
                onClick={onDismissStockConflicts}
              >
                Actualizar y continuar
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Último momento antes de pagar: si el pedido trae una preventa, espera
          COMPLETO. Se dice aquí y no solo en el carrito porque desde la ficha
          se puede llegar directo a pagar. */}
      <PresaleCartNotice items={cartItems} />

      <FormField
        control={form.control}
        name="paymentMethod"
        render={({ field }) => (
          <FormItem className="space-y-3">
            <FormLabel id={paymentLabelId} className="text-foreground/90">
              Método de pago *
            </FormLabel>
            <FormControl>
              <PaymentMethodSelector
                value={field.value}
                onChange={field.onChange}
                disabled={isLoading}
                ariaLabelledBy={paymentLabelId}
                omit={!codAvailable ? [PaymentMethod.COD] : []}
                disabledMessages={
                  !codAvailable
                    ? {
                        [PaymentMethod.COD]: hasPresale
                          ? "Las preventas se pagan al reservar"
                          : shippingOptionType === "ENVIOCLICK"
                            ? "No disponible con esta transportadora"
                            : "No disponible para este envío",
                      }
                    : undefined
                }
              />
            </FormControl>
            <FormMessage reserveSpace />
          </FormItem>
        )}
      />

      <div className="space-y-3">
        <p className="font-serif text-xs font-semibold text-foreground/90">
          Revisa tu pedido
        </p>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div className="flex gap-3 rounded-xl border p-3.5 text-sm">
            <UserRound
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1 space-y-0.5 leading-snug">
              <p className="font-semibold">{values.fullName}</p>
              <p className="truncate text-muted-foreground">{values.email}</p>
              <p className="text-muted-foreground">{values.telephone}</p>
              {values.documentId && (
                <p className="text-muted-foreground">
                  Documento {values.documentId}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="link"
              className="h-auto shrink-0 self-start px-0 text-sm font-semibold underline underline-offset-4"
              onClick={() => onEditStep(1)}
            >
              Editar
              <span className="sr-only"> tus datos</span>
            </Button>
          </div>
          <div className="flex gap-3 rounded-xl border p-3.5 text-sm">
            <MapPin
              className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1 space-y-0.5 leading-snug">
              <p className="font-semibold">
                {values.address1}
                {values.address2 ? `, ${values.address2}` : ""}
              </p>
              <p className="text-muted-foreground">
                {values.city}, {values.department}
              </p>
              {shippingLine && (
                <p className="text-muted-foreground">
                  {shippingLine}
                  {shippingOptionType === "ENVIOCLICK" ? (
                    <>
                      {" · "}
                      {freeShipping ? (
                        <span className="font-semibold text-success">
                          Envío gratis
                        </span>
                      ) : (
                        <Currency
                          value={shippingCost}
                          className="inline text-sm font-semibold"
                        />
                      )}
                    </>
                  ) : null}
                </p>
              )}
            </div>
            <Button
              type="button"
              variant="link"
              className="h-auto shrink-0 self-start px-0 text-sm font-semibold underline underline-offset-4"
              onClick={() => onEditStep(2)}
            >
              Editar
              <span className="sr-only"> la entrega</span>
            </Button>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <WelcomeBenefitCard
          onApply={onApplyWelcomeBenefit}
          isApplying={validateCouponStatus === "pending"}
        />
        <CouponField
          form={form}
          isLoading={isLoading}
          couponState={couponState}
          setCouponState={setCouponState}
          validateCouponMutate={validateCouponMutate}
          validateCouponStatus={validateCouponStatus}
          subtotal={subtotal}
        />
      </div>
    </div>
  );
};
