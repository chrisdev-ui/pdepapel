import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { PaymentMethodSelector } from "@/components/ui/payment-method-selector";
import { PaymentMethod } from "@/constants";
import { UseFormReturn } from "react-hook-form";
import { CheckoutFormValue } from "../multi-step-checkout-form";

interface PaymentInfoStepProps {
  form: UseFormReturn<CheckoutFormValue>;
  isLoading?: boolean;
}

export const PaymentInfoStep = ({ form, isLoading }: PaymentInfoStepProps) => {
  return (
    <div className="space-y-8 duration-500 animate-in fade-in-0 slide-in-from-right-4">
      <div className="space-y-2">
        <h2 className="bg-gradient-to-r from-primary to-accent bg-clip-text pb-1 text-3xl font-bold text-transparent">
          Información de pago
        </h2>
        <p className="text-muted-foreground">
          Elige el método de pago para continuar
        </p>
      </div>

      <FormField
        control={form.control}
        name="paymentMethod"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Método de pago *</FormLabel>
            <FormControl>
              <PaymentMethodSelector
                value={field.value}
                onChange={field.onChange}
                disabled={isLoading}
                omit={[PaymentMethod.COD]}
              />
            </FormControl>
            <FormDescription>
              Selecciona cómo deseas realizar el pago de tu pedido
            </FormDescription>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
};
