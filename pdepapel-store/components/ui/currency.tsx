import { cn } from "@/lib/utils";

const formatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "COP",
  currencyDisplay: "narrowSymbol",
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
  useGrouping: true,
});

interface CurrencyProps {
  value: number | string;
  className?: string;
}

export const Currency: React.FC<CurrencyProps> = ({ value, className }) => {
  return (
    <div className={cn("text-2xl", className)}>
      {formatter.format(Number(value))}
    </div>
  );
};
