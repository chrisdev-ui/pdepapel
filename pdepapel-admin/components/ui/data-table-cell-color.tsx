import { cn } from "@/lib/utils";

interface DataTableCellColorProps extends React.HTMLAttributes<HTMLDivElement> {
  color: string;
}

export function DataTableCellColor({
  className,
  color,
  ...props
}: DataTableCellColorProps) {
  return (
    <div className={cn("flex items-center gap-x-2", className)} {...props}>
      {color.toUpperCase()}
      <div
        className="h-6 w-6 rounded-full border"
        style={{ backgroundColor: color }}
      />
    </div>
  );
}
