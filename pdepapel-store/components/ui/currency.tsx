"use client";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

const formatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "COP",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  useGrouping: true,
});

interface CurrencyProps {
  value?: number | string;
  className?: string;
}

export const Currency: React.FC<CurrencyProps> = ({ value = 0, className }) => {
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }
  return (
    <div className={cn("text-2xl", className)}>
      {formatter.format(Number(value))}
    </div>
  );
};
