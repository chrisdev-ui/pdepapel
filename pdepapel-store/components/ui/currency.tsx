import { cn, currencyFormatter } from "@/lib/utils";

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
  return (
    <div className={cn("font-quicksand font-semibold tracking-tight text-2xl", className)}>
      {isNegative ? "-" : ""}
      {currencyFormatter.format(Number(value))}
    </div>
  );
};
