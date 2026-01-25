"use client";
import { cn, currencyFormatter } from "@/lib/utils";
import { useEffect, useState } from "react";

interface CurrencyProps {
  value?: number | string;
  className?: string;
  isNegative?: boolean;
}

export const Currency: React.FC<CurrencyProps> = ({
  value = 0,
  isNegative = false,
  className,
}) => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }
  return (
    <div className={cn("font-serif text-2xl", className)}>
      {isNegative ? "-" : ""}
      {currencyFormatter.format(Number(value))}
    </div>
  );
};
