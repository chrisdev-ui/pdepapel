import { currencyFormatter } from "@/lib/utils";

interface DataTableCellCurrencyProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  decimalScale?: number;
}

export function DataTableCellCurrency({
  value,
  className,
  decimalScale,
  ...props
}: DataTableCellCurrencyProps) {
  return (
    <div className={className} {...props}>
      {currencyFormatter(value, { decimalScale })}
    </div>
  );
}
