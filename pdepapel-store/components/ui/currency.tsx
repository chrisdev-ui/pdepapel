"use client";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";

const formatter = new Intl.NumberFormat("es-CO", {
  style: "currency",
  currency: "COP",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  useGrouping: true,
});

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
      {formatter.format(Number(value))}
    </div>
  );
};
