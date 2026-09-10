import { Button } from "@/components/ui/button";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Check, Loader2, Tag } from "lucide-react";
import { UseFormReturn } from "react-hook-form";
import { CheckoutFormValue, CouponState } from "./multi-step-checkout-form";

interface CouponFieldProps {
  form: UseFormReturn<CheckoutFormValue>;
  isLoading?: boolean;
  couponState: CouponState;
  setCouponState: React.Dispatch<React.SetStateAction<CouponState>>;
  validateCouponMutate: (variables: { code: string; subtotal: number }) => void;
  validateCouponStatus: "idle" | "pending" | "success" | "error";
  subtotal: number;
}

export const CouponField = ({
  form,
  isLoading,
  couponState,
  setCouponState,
  validateCouponMutate,
  validateCouponStatus,
  subtotal,
}: CouponFieldProps) => {
  const isApplied = couponState.isValid === true && Boolean(couponState.coupon);
  const isPending = validateCouponStatus === "pending";

  return (
    <FormField
      control={form.control}
      name="couponCode"
      render={({ field }) => (
        <FormItem className="flex flex-col">
          <FormLabel className="text-foreground/90">
            ¿Tienes un cupón?
          </FormLabel>
          <div className="flex items-stretch gap-2">
            <div className="relative flex-1">
              <Tag
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-pink-froly"
              />
              <FormControl>
                <Input
                  className={cn(
                    "h-11 bg-blue-purple/20 pl-10 uppercase transition-colors duration-200 placeholder:normal-case",
                    {
                      "border-success focus-visible:ring-success/30": isApplied,
                      "border-destructive focus-visible:ring-destructive/30":
                        couponState.isValid === false,
                    },
                  )}
                  disabled={isLoading || isPending || isApplied}
                  placeholder="Escribe tu código"
                  maxLength={15}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  {...field}
                  onChange={(event) => {
                    setCouponState((prev) => ({ ...prev, isValid: null }));
                    field.onChange(event.target.value.toUpperCase());
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    // Enter here must validate the coupon, never submit the order.
                    event.preventDefault();
                    if (field.value && !isApplied && !isPending) {
                      validateCouponMutate({
                        code: field.value.toUpperCase(),
                        subtotal,
                      });
                    }
                  }}
                />
              </FormControl>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={isPending || (!field.value && !isApplied)}
              className={cn("h-11 shrink-0 rounded-full px-4", {
                "border-success text-success hover:text-success": isApplied,
              })}
              onClick={() => {
                if (isApplied) {
                  form.setValue("couponCode", "");
                  // Removing a coupon is not an error: clear the state
                  // instead of leaving the field painted red.
                  setCouponState((prev) => ({
                    ...prev,
                    coupon: null,
                    isValid: null,
                  }));
                  return;
                }
                if (!field.value) return;
                validateCouponMutate({
                  code: field.value.toUpperCase(),
                  subtotal,
                });
              }}
            >
              {isPending ? (
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
              ) : isApplied ? (
                "Quitar"
              ) : (
                "Aplicar"
              )}
            </Button>
          </div>
          {isApplied && couponState.coupon ? (
            <p
              className="flex items-center gap-1.5 text-xs font-semibold text-success"
              role="status"
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Cupón {couponState.coupon.code} aplicado.
            </p>
          ) : null}
          <FormMessage />
        </FormItem>
      )}
    />
  );
};
