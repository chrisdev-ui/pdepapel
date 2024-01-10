import * as React from "react";

import { useInputMask } from "@/hooks/use-input-mask";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  mask?: string;
  placeholderChar?: string;
  charRegex?: RegExp;
  numRegex?: RegExp;
  type?: "raw" | "mask";
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    { className, type, mask, placeholderChar, charRegex, numRegex, ...props },
    ref,
  ) => {
    const inputMaskProps = useInputMask({
      mask,
      placeholderChar,
      charRegex,
      numRegex,
      type,
      value: props.value?.toString(),
    }).getInputProps();

    return (
      <input
        {...props}
        {...inputMaskProps}
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        ref={ref}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
