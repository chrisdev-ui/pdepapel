import { TintBadge } from "@/components/ui/tint-badge";
import { cn } from "@/lib/utils";

export interface KitRowDetailProps {
  /** Piezas congeladas al reservar; vacío o ausente en un producto suelto. */
  components?: { name: string; quantityPerKit: number }[];
  className?: string;
}

/**
 * Un kit reservado es una sola línea de la feria; esto es lo que la distingue
 * de un producto suelto: la insignia con cuántas piezas lleva y la lista de
 * piezas tal como se apartaron. Se usa en la conciliación y en el cierre.
 */
export function KitRowDetail({ components, className }: KitRowDetailProps) {
  if (!components || components.length === 0) return null;
  const pieces = components.reduce(
    (total, line) => total + line.quantityPerKit,
    0,
  );
  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <TintBadge
        tone="lavender"
        label={`Kit · ${pieces} ${pieces === 1 ? "pieza" : "piezas"}`}
        className="w-fit text-[11px]"
      />
      <p className="text-xs text-muted-foreground">
        {components
          .map((line) => `${line.quantityPerKit} × ${line.name}`)
          .join(" · ")}
      </p>
    </div>
  );
}
