import { Check, Gift, Loader2 } from "lucide-react";
import { UseFormReturn } from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Currency } from "@/components/ui/currency";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { CheckoutFormValue, GiftCardState } from "./multi-step-checkout-form";

interface GiftCardFieldProps {
  form: UseFormReturn<CheckoutFormValue>;
  isLoading?: boolean;
  giftCardState: GiftCardState;
  setGiftCardState: React.Dispatch<React.SetStateAction<GiftCardState>>;
  validateGiftCardMutate: (code: string) => void;
  validateGiftCardStatus: "idle" | "pending" | "success" | "error";
  /** Cuánto cubre la tarjeta de este pedido (saldo o total, lo menor). */
  appliedAmount: number;
}

/** Formatea lo escrito como PDP-XXXX-XXXX-XXXX sin obligar a los guiones. */
const formatTyped = (value: string) => {
  const raw = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const body = raw.startsWith("PDP") ? raw.slice(3) : raw;
  const groups = body.slice(0, 12).match(/.{1,4}/g) ?? [];
  return groups.length ? `PDP-${groups.join("-")}` : body ? "PDP-" : "";
};

/**
 * «¿Tienes una tarjeta de regalo?», al lado del cupón. El cupón rebaja el
 * total; la tarjeta paga lo que queda, entera o por partes.
 */
export const GiftCardField = ({
  form,
  isLoading,
  giftCardState,
  setGiftCardState,
  validateGiftCardMutate,
  validateGiftCardStatus,
  appliedAmount,
}: GiftCardFieldProps) => {
  const isApplied = giftCardState.isValid === true && Boolean(giftCardState.card);
  const isPending = validateGiftCardStatus === "pending";

  return (
    <FormField
      control={form.control}
      name="giftCardCode"
      render={({ field }) => (
        <FormItem className="flex flex-col">
          <FormLabel className="text-foreground/90">¿Tienes una tarjeta de regalo?</FormLabel>
          <div className="flex items-stretch gap-2">
            <div className="relative flex-1">
              <Gift
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-pink-froly"
              />
              <FormControl>
                <Input
                  className={cn(
                    "h-11 bg-blue-purple/20 pl-10 font-quicksand tracking-wide transition-colors duration-200",
                    {
                      "border-success focus-visible:ring-success/30": isApplied,
                      "border-destructive focus-visible:ring-destructive/30": giftCardState.isValid === false,
                    },
                  )}
                  disabled={isLoading || isPending || isApplied}
                  placeholder="PDP-XXXX-XXXX-XXXX"
                  maxLength={18}
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  {...field}
                  value={field.value ?? ""}
                  onChange={(event) => {
                    setGiftCardState((prev) => ({ ...prev, isValid: null }));
                    field.onChange(formatTyped(event.target.value));
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    // Enter valida la tarjeta, nunca envía el pedido.
                    event.preventDefault();
                    if (field.value && !isApplied && !isPending) validateGiftCardMutate(field.value);
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
                  form.setValue("giftCardCode", "");
                  setGiftCardState({ card: null, isValid: null });
                  return;
                }
                if (!field.value) return;
                validateGiftCardMutate(field.value);
              }}
            >
              {isPending ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : isApplied ? "Quitar" : "Aplicar"}
            </Button>
          </div>
          {isApplied && giftCardState.card ? (
            <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-success" role="status">
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Tarjeta que termina en {giftCardState.card.last4}: cubre{" "}
              <Currency value={appliedAmount} className="text-xs font-semibold" />
              {giftCardState.card.balance > appliedAmount ? (
                <>
                  {" "}
                  y le quedan <Currency value={giftCardState.card.balance - appliedAmount} className="text-xs font-semibold" />.
                </>
              ) : (
                "."
              )}
            </p>
          ) : null}
          <FormMessage reserveSpace />
        </FormItem>
      )}
    />
  );
};
