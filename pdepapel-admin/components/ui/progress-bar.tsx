import { cn } from "@/lib/utils";

interface ProgressBarProps {
  /** 0–100; se recorta a ese rango. */
  percent: number;
  /** Color de la parte llena (`bg-tint-mint`, `bg-primary/60`…). */
  barClassName?: string;
  className?: string;
}

/**
 * La barra fina de avance del panel. Tres pantallas la tenían copiada con el
 * mismo marcado y solo el color distinto (Aprovisionamiento en la lista y en
 * el pedido, Inventario en la cobertura).
 *
 * Va `aria-hidden`: quien la usa pone al lado el texto que dice la cifra, que
 * es lo que lee un lector de pantalla.
 */
export function ProgressBar({ percent, barClassName = "bg-primary/60", className }: ProgressBarProps) {
  const safe = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
  return (
    <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-muted", className)} aria-hidden="true">
      <div className={cn("h-full rounded-full", barClassName)} style={{ width: `${safe}%` }} />
    </div>
  );
}

/** Porcentaje recibido sobre pedido, con el color que le corresponde. */
export function receivedPercent(received: number, ordered: number): number {
  return ordered > 0 ? Math.min(100, Math.round((received / ordered) * 100)) : 0;
}
