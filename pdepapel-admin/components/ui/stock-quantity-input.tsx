import { cn } from "@/lib/utils";
import { Minus, Plus } from "lucide-react";
import React, { useCallback, useState } from "react";

export interface StockQuantityInputProps {
  value?: number;
  onChange?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  disabled?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg" | "default";
}

export const StockQuantityInput: React.FC<StockQuantityInputProps> = ({
  value: controlledValue,
  onChange,
  min = 0,
  max = 9999,
  step = 1,
  disabled = false,
  className,
  size = "default",
}) => {
  const [internalValue, setInternalValue] = useState(min);
  const [isPressed, setIsPressed] = useState<"minus" | "plus" | null>(null);

  const value = controlledValue ?? internalValue;

  const updateValue = useCallback(
    (newValue: number) => {
      const clampedValue = Math.max(min, Math.min(max, newValue));
      if (onChange) {
        onChange(clampedValue);
      } else {
        setInternalValue(clampedValue);
      }
    },
    [min, max, onChange],
  );

  const handleDecrement = () => {
    if (value > min && !disabled) {
      updateValue(value - step);
    }
  };

  const handleIncrement = () => {
    if (value < max && !disabled) {
      updateValue(value + step);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const newValue = parseInt(e.target.value, 10);
    if (!isNaN(newValue)) {
      updateValue(newValue);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      handleIncrement();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      handleDecrement();
    }
  };

  const sizeClasses = {
    default: {
      container: "h-8",
      button: "w-8 h-8",
      icon: "w-3.5 h-3.5",
      input: "text-sm",
    },
    sm: {
      container: "h-9 gap-0.5",
      button: "w-9 h-9",
      icon: "w-3.5 h-3.5",
      input: "w-10 text-sm",
    },
    md: {
      container: "h-12 gap-1",
      button: "w-12 h-12",
      icon: "w-4 h-4",
      input: "w-14 text-base",
    },
    lg: {
      container: "h-14 gap-1.5",
      button: "w-14 h-14",
      icon: "w-5 h-5",
      input: "w-16 text-lg",
    },
  };

  const sizes = sizeClasses[size];
  const isAtMin = value <= min;
  const isAtMax = value >= max;

  return (
    <div
      className={cn(
        "stock-quantity-container inline-flex w-full items-center justify-between rounded-xl border border-input bg-background p-1",
        disabled && "cursor-not-allowed opacity-50",
        className,
      )}
    >
      {/* Decrement Button */}
      <button
        type="button"
        onClick={handleDecrement}
        onMouseDown={() => setIsPressed("minus")}
        onMouseUp={() => setIsPressed(null)}
        onMouseLeave={() => setIsPressed(null)}
        disabled={disabled || isAtMin}
        className={cn(
          "stock-quantity-button flex items-center justify-center rounded-lg border border-border/50 bg-background shadow-sm",
          "transition-all duration-200 ease-out",
          "hover:scale-105 hover:bg-accent hover:shadow-md",
          "active:scale-95 active:shadow-sm",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-background disabled:hover:shadow-sm",
          isPressed === "minus" && "scale-95 bg-accent shadow-sm",
          sizes.button,
        )}
        aria-label="Disminuir cantidad"
      >
        <Minus
          className={cn(
            "text-foreground transition-transform duration-150",
            isPressed === "minus" && "scale-90",
            sizes.icon,
          )}
          strokeWidth={2.5}
        />
      </button>

      {/* Input Field */}
      <div className="relative flex items-center justify-center">
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          role="spinbutton"
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          className={cn(
            "stock-quantity-input border-none bg-transparent text-center font-semibold outline-none",
            "tabular-nums text-foreground",
            "transition-all duration-200",
            "focus:text-primary",
            "disabled:cursor-not-allowed",
            "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
            sizes.input,
          )}
          aria-label="Cantidad"
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
        />
      </div>

      {/* Increment Button */}
      <button
        type="button"
        onClick={handleIncrement}
        onMouseDown={() => setIsPressed("plus")}
        onMouseUp={() => setIsPressed(null)}
        onMouseLeave={() => setIsPressed(null)}
        disabled={disabled || isAtMax}
        className={cn(
          "stock-quantity-button flex items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm",
          "transition-all duration-200 ease-out",
          "hover:scale-105 hover:bg-primary/90 hover:shadow-md",
          "active:scale-95 active:shadow-sm",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:hover:bg-primary disabled:hover:shadow-sm",
          isPressed === "plus" && "scale-95 shadow-sm",
          sizes.button,
        )}
        aria-label="Aumentar cantidad"
      >
        <Plus
          className={cn(
            "transition-transform duration-150",
            isPressed === "plus" && "scale-90",
            sizes.icon,
          )}
          strokeWidth={2.5}
        />
      </button>
    </div>
  );
};
