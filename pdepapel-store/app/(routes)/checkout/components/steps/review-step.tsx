import { Icons } from "@/components/icons";
import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { PaymentMethod } from "@/constants";
import { cn } from "@/lib/utils";
import { Edit, Loader2, Tag } from "lucide-react";
import { UseFormReturn } from "react-hook-form";
import { CheckoutFormValue, CouponState } from "../multi-step-checkout-form";

interface ReviewStepProps {
  form: UseFormReturn<CheckoutFormValue>;
  isLoading?: boolean;
  couponState: CouponState;
  setCouponState: React.Dispatch<React.SetStateAction<CouponState>>;
  validateCouponMutate: (variables: { code: string; subtotal: number }) => void;
  validateCouponStatus: "idle" | "pending" | "success" | "error";
  subtotal: number;
  onEditStep: (step: number) => void;
}

export const ReviewStep = ({
  form,
  isLoading,
  couponState,
  setCouponState,
  validateCouponMutate,
  validateCouponStatus,
  subtotal,
  onEditStep,
}: ReviewStepProps) => {
  const { getValues } = form;
  const values = getValues();

  const getPaymentMethodLabel = (method: PaymentMethod) => {
    switch (method) {
      case PaymentMethod.COD:
        return "Pago contra entrega";
      case PaymentMethod.BankTransfer:
        return "Transferencia Bancaria";
      case PaymentMethod.Wompi:
        return "Wompi (Tarjetas, PSE, Nequi, etc.)";
      case PaymentMethod.PayU:
        return "PayU (Tarjetas, PSE, Efectivo, etc.)";
      default:
        return method;
    }
  };

  return (
    <div className="space-y-8 duration-500 animate-in fade-in-0 slide-in-from-right-4">
      <div className="space-y-2">
        <h2 className="bg-gradient-to-r from-primary to-accent bg-clip-text text-3xl font-bold text-transparent">
          Revisión
        </h2>
        <p className="text-muted-foreground">
          Verifica los detalles de tu pedido antes de finalizar.
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Contact Info */}
        <div className="rounded-lg border p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Información de Contacto</h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => onEditStep(1)}
            >
              <Edit className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-1 text-sm">
            <p className="font-medium">
              {values.firstName} {values.lastName}
            </p>
            <p className="text-muted-foreground">{values.email}</p>
            <p className="text-muted-foreground">{values.telephone}</p>
          </div>
        </div>

        {/* Shipping Info */}
        <div className="rounded-lg border p-4">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Dirección de Envío</h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => onEditStep(2)}
            >
              <Edit className="h-4 w-4" />
            </Button>
          </div>
          <div className="space-y-1 text-sm">
            <p className="font-medium">{values.address1}</p>
            {values.address2 && (
              <p className="text-muted-foreground">{values.address2}</p>
            )}
            <p className="text-muted-foreground">
              {values.city}, {values.department}
            </p>
            <p className="text-muted-foreground">
              {values.shipping?.carrierName}
            </p>
          </div>
        </div>

        {/* Payment Method */}
        <div className="rounded-lg border p-4 md:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="font-semibold">Método de Pago</h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 p-0"
              onClick={() => onEditStep(3)}
            >
              <Edit className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-3">
            {values.paymentMethod === PaymentMethod.COD && (
              <Icons.payments.cashOnDelivery className="h-8 w-8 text-primary" />
            )}
            {values.paymentMethod === PaymentMethod.BankTransfer && (
              <Icons.payments.transfer className="h-8 w-8 text-primary" />
            )}
            {values.paymentMethod === PaymentMethod.Wompi && (
              <Icons.payments.wompi className="h-8 w-auto" />
            )}
            {values.paymentMethod === PaymentMethod.PayU && (
              <Icons.payments.payu className="h-8 w-auto" />
            )}
            <p className="font-medium">
              {getPaymentMethodLabel(values.paymentMethod)}
            </p>
          </div>
        </div>
      </div>

      {/* Coupon Form */}
      <div className="space-y-4">
        <FormField
          control={form.control}
          name="couponCode"
          render={({ field }) => (
            <FormItem className="flex flex-col">
              <FormLabel className="flex items-center gap-2 text-base font-semibold">
                Redime un cupón de descuento
              </FormLabel>
              <div
                className={cn(
                  "group relative flex items-center gap-x-2 rounded-lg shadow-[0_2px_10px_rgba(0,0,0,0.06)] transition-all duration-300 hover:shadow-[0_2px_10px_rgba(0,0,0,0.1)]",
                  {
                    "shadow-success/40": couponState.isValid === true,
                    "shadow-destructive/40": couponState.isValid === false,
                  },
                )}
              >
                <Tag className="absolute left-3 top-3 h-6 w-6 text-pink-froly" />
                <FormControl>
                  <Input
                    className={cn(
                      "h-12 px-4 pl-12 text-lg transition-colors duration-200 focus-visible:outline-none focus-visible:ring-0",
                      {
                        "border-success focus:border-success focus:ring-success/20":
                          couponState.isValid === true,
                        "border-destructive focus:border-destructive focus:ring-destructive/20":
                          couponState.isValid === false,
                      },
                    )}
                    disabled={
                      isLoading ||
                      validateCouponStatus === "pending" ||
                      couponState.isValid === true
                    }
                    placeholder="Escribe tu código de cupón"
                    maxLength={15}
                    {...field}
                    autoComplete="off"
                    autoCorrect="off"
                    onChange={(e) => {
                      setCouponState((prev) => ({
                        ...prev,
                        isValid: null,
                      }));
                      field.onChange(e.target.value.toUpperCase());
                    }}
                  />
                </FormControl>
                <div className="absolute right-2 top-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={
                      validateCouponStatus === "pending" || !field.value
                    }
                    className={cn(
                      "h-8 px-3 font-medium transition-all duration-200 hover:bg-blue-purple/20",
                      {
                        "text-success hover:bg-success/50 hover:text-success/80":
                          couponState.isValid === true,
                        "text-destructive hover:bg-destructive/50 hover:text-destructive/80":
                          couponState.isValid === false,
                        "text-lg": field.value,
                      },
                    )}
                    onClick={() => {
                      if (!field.value) return;

                      if (couponState.isValid && couponState.coupon) {
                        form.setValue("couponCode", "");
                        setCouponState((prev) => ({
                          ...prev,
                          coupon: null,
                          isValid: false,
                        }));
                        return;
                      }

                      validateCouponMutate({
                        code: field.value.toUpperCase(),
                        subtotal,
                      });
                    }}
                  >
                    {validateCouponStatus === "pending" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : couponState.coupon ? (
                      "Remover"
                    ) : (
                      "Validar"
                    )}
                  </Button>
                </div>
              </div>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    </div>
  );
};
