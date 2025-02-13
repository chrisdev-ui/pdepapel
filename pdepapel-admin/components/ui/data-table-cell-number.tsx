import { numberFormatter } from "@/lib/utils";

interface DataTableCellNumberProps
  extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  isPercentage?: boolean;
}

export function DataTableCellNumber({
  value,
  className,
  isPercentage = false,
  ...props
}: DataTableCellNumberProps) {
  return (
    <div className={className} {...props}>
      {numberFormatter.format(value)}
      {isPercentage ? "%" : ""}
    </div>
  );
}
