import { currencyFormatter } from "@/lib/utils";

interface DataTableCellCurrencyProps
  extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
}

export function DataTableCellCurrency({
  value,
  className,
  ...props
}: DataTableCellCurrencyProps) {
  return (
    <div className={className} {...props}>
      {currencyFormatter(value)}
    </div>
  );
}
