"use client";

import { Minus, Plus } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";
import { cva } from "class-variance-authority";

type Sizes = "default" | "medium" | "large";

const buttonLeftVariants = cva(
  "group border-none bg-white py-2 font-serif font-semibold text-blue-yankees disabled:cursor-not-allowed",
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
  "group border-none bg-white py-2 font-serif font-semibold text-blue-yankees disabled:cursor-not-allowed",
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
        className={cn(
          "flex rounded-md border border-blue-purple bg-white shadow-sm",
          className,
        )}
        {...props}
      >
        <button
          className={cn(buttonLeftVariants({ size }))}
          onClick={decrement}
          disabled={disableDec}
          suppressHydrationWarning
        >
          <Minus
            className="h-3.5 w-3.5 group-disabled:text-gray-500"
            strokeWidth={3}
          />
        </button>
        <input
          className="w-12 text-center text-sm"
          type="text"
          value={value}
          readOnly
        />
        <button
          className={cn(buttonRightVariants({ size }))}
          onClick={increment}
          disabled={disableInc}
          suppressHydrationWarning
        >
          <Plus
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
