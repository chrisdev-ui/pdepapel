"use client";

import { cn } from "@/lib/utils";
import { Package } from "lucide-react";
import { forwardRef } from "react";

interface ProductPlaceholderProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: "sm" | "md" | "lg" | "xl";
  showIcon?: boolean;
  showText?: boolean;
  text?: string;
  aspectRatio?: "square" | "video" | "portrait";
}

const ProductPlaceholder = forwardRef<HTMLDivElement, ProductPlaceholderProps>(
  (
    {
      className,
      size = "md",
      showIcon = true,
      showText = true,
      text = "Sin imagen",
      aspectRatio = "square",
      ...props
    },
    ref,
  ) => {
    const sizeClasses = {
      sm: "h-16 w-16",
      md: "h-32 w-32",
      lg: "h-48 w-48",
      xl: "h-64 w-64",
    };

    const iconSizes = {
      sm: "h-4 w-4",
      md: "h-8 w-8",
      lg: "h-12 w-12",
      xl: "h-16 w-16",
    };

    const textSizes = {
      sm: "text-xs",
      md: "text-sm",
      lg: "text-base",
      xl: "text-lg",
    };

    const aspectRatioClasses = {
      square: "aspect-square",
      video: "aspect-video",
      portrait: "aspect-[3/4]",
    };

    return (
      <div
        ref={ref}
        className={cn(
          "relative flex flex-col items-center justify-center rounded-md border-2 border-dashed border-muted-foreground/25 bg-muted/20 transition-colors",
          aspectRatioClasses[aspectRatio],
          sizeClasses[size],
          "hover:border-muted-foreground/50 hover:bg-muted/30",
          className,
        )}
        {...props}
      >
        {showIcon && (
          <Package
            className={cn("text-muted-foreground/60", iconSizes[size])}
          />
        )}
        {showText && (
          <span
            className={cn(
              "mt-1 font-medium text-muted-foreground/60",
              textSizes[size],
            )}
          >
            {text}
          </span>
        )}
      </div>
    );
  },
);

ProductPlaceholder.displayName = "ProductPlaceholder";

export { ProductPlaceholder };
