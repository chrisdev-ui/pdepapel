import { cn } from "@/lib/utils";
import { Star } from "lucide-react";
import type React from "react";

interface DataTableCellRatingProps
  extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  maxRating?: number;
}

export function DataTableCellRating({
  value,
  maxRating = 5,
  className,
  ...props
}: DataTableCellRatingProps) {
  return (
    <div className={cn("flex items-center space-x-1", className)} {...props}>
      {[...Array(maxRating)].map((_, index) => (
        <Star
          key={index}
          className={cn(
            "h-4 w-4",
            index < value ? "fill-yellow-400 text-yellow-400" : "text-gray-300",
          )}
          aria-hidden="true"
        />
      ))}
      <span className="sr-only">
        Calificación de {value} de {maxRating}
      </span>
    </div>
  );
}
