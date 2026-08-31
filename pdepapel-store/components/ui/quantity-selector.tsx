"use client";

import { Minus, Plus } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";
import { cva } from "class-variance-authority";

type Sizes = "default" | "medium" | "large";

const buttonLeftVariants = cva(
  "group flex min-h-11 min-w-11 touch-manipulation items-center justify-center border-none bg-white font-sans font-semibold text-blue-yankees focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-yankees disabled:cursor-not-allowed",
  {
    variants: {
      size: {
        default: "rounded-bl-md rounded-tl-md py-2 pl-4 pr-1",
        medium: "rounded-bl-md rounded-tl-md py-3 pl-6 pr-1",
        large: "rounded-bl-md rounded-tl-md py-4 pl-8 pr-2",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

const buttonRightVariants = cva(
  "group flex min-h-11 min-w-11 touch-manipulation items-center justify-center border-none bg-white font-sans font-semibold text-blue-yankees focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-yankees disabled:cursor-not-allowed",
  {
    variants: {
      size: {
        default: "rounded-br-md rounded-tr-md py-2 pl-1 pr-4",
        medium: "rounded-br-md rounded-tr-md py-3 pl-1 pr-6",
        large: "rounded-br-md rounded-tr-md py-4 pl-2 pr-8",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

interface QuantitySelectorProps {
  min?: number;
  max: number;
  initialValue?: number;
  step?: number;
  onValueChange: (value: number) => void;
  size?: Sizes;
  label?: string;
}

const QuantitySelector = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & QuantitySelectorProps
>(
  (
    {
      className,
      initialValue = 1,
      min = 1,
      step = 1,
      max,
      onValueChange,
      size = "default",
      label = "Cantidad",
      ...props
    },
    ref,
  ) => {
    const [value, setValue] = React.useState(initialValue);
    const disableDec = value <= min;
    const disableInc = value + step > max;

    const increment = () => {
      if (value + step <= max) {
        const newValue = value + step;
        setValue(newValue);
        onValueChange(newValue);
      }
    };

    const decrement = () => {
      if (value - step >= min) {
        const newValue = value - step;
        setValue(newValue);
        onValueChange(newValue);
      }
    };
    return (
      <div
        ref={ref}
        role="group"
        aria-label={label}
        className={cn(
          "flex rounded-md border border-blue-purple bg-white shadow-sm",
          className,
        )}
        {...props}
      >
        <button
          type="button"
          aria-label={`Disminuir ${label}`}
          className={cn(buttonLeftVariants({ size }))}
          onClick={decrement}
          disabled={disableDec}
          suppressHydrationWarning
        >
          <Minus
            aria-hidden="true"
            className="h-3.5 w-3.5 group-disabled:text-gray-500"
            strokeWidth={3}
          />
        </button>
        <input
          className="h-11 w-12 text-center text-sm tabular-nums outline-none"
          type="text"
          aria-label={label}
          value={value}
          readOnly
        />
        <button
          type="button"
          aria-label={`Aumentar ${label}`}
          className={cn(buttonRightVariants({ size }))}
          onClick={increment}
          disabled={disableInc}
          suppressHydrationWarning
        >
          <Plus
            aria-hidden="true"
            className="h-3.5 w-3.5 group-disabled:text-gray-500"
            strokeWidth={3}
          />
        </button>
      </div>
    );
  },
);

QuantitySelector.displayName = "QuantitySelector";

export { QuantitySelector };
