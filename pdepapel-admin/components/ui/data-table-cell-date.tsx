import { getColombiaDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface DataTableCellDateProps extends React.HTMLAttributes<HTMLDivElement> {
  date: Date;
}

export function DataTableCellDate({
  date,
  className,
  color,
  ...props
}: DataTableCellDateProps) {
  const colombiaDate = getColombiaDate(date);
  return (
    <div className={cn(className)} {...props}>
      {format(colombiaDate, "dd 'de' MMMM 'de' yyyy", {
        locale: es,
      })}
    </div>
  );
}
