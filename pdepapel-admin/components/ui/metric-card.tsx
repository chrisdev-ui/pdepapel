import { cn } from "@/lib/utils";

interface MetricCardProps {
  label: string;
  value: string;
  note?: string;
  icon: React.ReactNode;
  /** Clase de fondo del icono (`bg-tint-*`). */
  tint: string;
  /** `care` resalta la tarjeta cuando pide atención. */
  tone?: "default" | "care";
  /** Acción pequeña bajo la nota (por ejemplo, el ajuste que corrige un cuadre). */
  action?: React.ReactNode;
  /**
   * Control pegado a la cifra, a su derecha. Lo pide Inicio para el ojo que
   * tapa las ventas del día cuando alguien mira la pantalla por encima del
   * hombro; sin esto, Inicio necesitaba su propia tarjeta casi idéntica.
   */
  valueAdornment?: React.ReactNode;
  className?: string;
}

/** Tarjeta de cifra de las cabeceras (Inventario, kardex): etiqueta, icono, valor y nota. */
export function MetricCard({
  label,
  value,
  note,
  icon,
  tint,
  tone = "default",
  action,
  valueAdornment,
  className,
}: MetricCardProps) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-2 rounded-xl border bg-white p-4 shadow-sm",
        tone === "care" && "border-tint-pink",
        className,
      )}
    >
      <div className="flex items-center justify-between">
        <span className="text-[13px] font-semibold text-muted-foreground">
          {label}
        </span>
        <span
          className={cn(
            "flex h-8 w-8 items-center justify-center rounded-lg text-primary",
            tint,
          )}
        >
          {icon}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="truncate text-[24px] font-bold leading-none tracking-tight text-primary">
          {value}
        </span>
        {valueAdornment}
      </div>
      {note && (
        <span className="truncate text-xs text-muted-foreground">{note}</span>
      )}
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}
