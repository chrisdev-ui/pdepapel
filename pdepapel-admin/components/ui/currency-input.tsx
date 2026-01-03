import * as React from "react";
import CurrencyInputField, {
  CurrencyInputProps,
} from "react-currency-input-field";

import { cn } from "@/lib/utils";

export interface CustomCurrencyInputProps
  extends Omit<CurrencyInputProps, "onChange" | "value"> {
  value?: number;
  onChange?: (value: number | undefined) => void;
}

const CurrencyInput = React.forwardRef<
  HTMLInputElement,
  CustomCurrencyInputProps
>(({ className, value, onChange, ...props }, ref) => {
  return (
    <CurrencyInputField
      ref={ref}
      className={cn(
        "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      value={value}
      onValueChange={(value) => {
        // Convert string to number or undefined
        const numericValue = value ? parseFloat(value) : undefined;
        onChange?.(numericValue);
      }}
      // Default Colombian peso configuration
      intlConfig={{ locale: "es-CO", currency: "COP" }}
      decimalScale={0} // No decimals for Colombian pesos
      allowNegativeValue={false}
      step={100} // Step by 100 pesos
      {...props}
    />
  );
});

CurrencyInput.displayName = "CurrencyInput";

export { CurrencyInput };
