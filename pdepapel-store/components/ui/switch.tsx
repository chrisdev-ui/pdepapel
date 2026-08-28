"use client";

import * as React from "react";

import { cn } from "@/lib/utils";

interface SwitchProps extends Omit<
  React.ButtonHTMLAttributes<HTMLButtonElement>,
  "aria-checked" | "onChange" | "role"
> {
  checked: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  (
    { checked, className, disabled, onCheckedChange, onClick, ...props },
    ref,
  ) => (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      data-state={checked ? "checked" : "unchecked"}
      disabled={disabled}
      className={cn(
        "group peer relative inline-flex h-11 w-11 shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-md border-2 border-transparent focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) onCheckedChange?.(!checked);
      }}
      {...props}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none relative block h-5 w-9 rounded-full bg-input transition-colors group-focus-visible:ring-2 group-focus-visible:ring-ring group-focus-visible:ring-offset-2 group-focus-visible:ring-offset-background data-[state=checked]:bg-primary"
        data-state={checked ? "checked" : "unchecked"}
      >
        <span
          className="absolute left-0.5 top-0.5 block h-4 w-4 rounded-full bg-background shadow-sm ring-0 transition-transform data-[state=checked]:translate-x-4"
          data-state={checked ? "checked" : "unchecked"}
        />
      </span>
    </button>
  ),
);
Switch.displayName = "Switch";

export { Switch };
