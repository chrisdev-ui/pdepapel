import { getColombiaDate } from "@/lib/date-utils";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface DataTableCellDateProps extends React.HTMLAttributes<HTMLDivElement> {
  date: Date;
  showTime?: boolean;
}

export function DataTableCellDate({
  date,
  className,
  showTime = false,
  ...props
}: DataTableCellDateProps) {
  const colombiaDate = getColombiaDate(date);
  const dateFormat = showTime
    ? "dd 'de' MMMM 'de' yyyy, hh:mm:ss a"
    : "dd 'de' MMMM 'de' yyyy";

  return (
    <div className={cn(className)} {...props}>
      {format(colombiaDate, dateFormat, {
        locale: es,
      })}
    </div>
  );
}
