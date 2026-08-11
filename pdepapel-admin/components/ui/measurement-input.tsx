import * as React from "react";

import { cn } from "@/lib/utils";

export interface MeasurementInputProps extends Omit<
  React.ComponentPropsWithoutRef<"input">,
  "type" | "value" | "onChange" | "min"
> {
  value?: number;
  onChange?: (value: number | undefined) => void;
  min?: number;
  unit: string;
}

const MeasurementInput = React.forwardRef<
  HTMLInputElement,
  MeasurementInputProps
>(
  (
    { className, value, onChange, min = 0, step = "0.1", unit, ...props },
    ref,
  ) => {
    return (
      <div className="relative min-w-0">
        <input
          ref={ref}
          type="number"
          inputMode="decimal"
          min={min}
          step={step}
          value={value ?? ""}
          onChange={(event) => {
            const nextValue = event.target.value;
            onChange?.(nextValue === "" ? undefined : Number(nextValue));
          }}
          className={cn(
            "flex h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 pr-12 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
            "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
            className,
          )}
          {...props}
        />
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
        >
          {unit}
        </span>
      </div>
    );
  },
);

MeasurementInput.displayName = "MeasurementInput";

export { MeasurementInput };
