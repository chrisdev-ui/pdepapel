import { numberFormatter } from "@/lib/utils";

interface DataTableCellNumberProps
  extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
}

export function DataTableCellNumber({
  value,
  className,
  ...props
}: DataTableCellNumberProps) {
  return (
    <div className={className} {...props}>
      {numberFormatter.format(value)}
    </div>
  );
}
