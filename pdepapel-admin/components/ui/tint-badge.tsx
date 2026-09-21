import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

const TONES: Record<string, string> = {
  mint: "bg-tint-mint",
  cream: "bg-tint-cream",
  sky: "bg-tint-sky",
  slate: "bg-muted",
  pink: "bg-tint-pink",
  lavender: "bg-tint-lavender",
};

export type TintTone = keyof typeof TONES;

/** Insignia de estado con tinte pastel y texto oscuro (contraste AA). */
export function TintBadge({
  label,
  tone,
  className,
  children,
}: {
  /** El texto de la insignia. Con `children` se ignora. */
  label?: string;
  tone: string;
  className?: string;
  /**
   * Para cuando la insignia lleva algo más que texto —una flecha de subida o
   * bajada junto al porcentaje—, que es la forma de no dejar el color como
   * única señal.
   */
  children?: ReactNode;
}) {
  // Un <span>: cabe dentro de párrafos y celdas sin romper el HTML (un div dentro de <p> rompe la hidratación).
  return (
    <span
      className={cn(
        badgeVariants({ variant: "outline" }),
        "whitespace-nowrap border-transparent font-semibold text-primary",
        TONES[tone] ?? "bg-muted",
        className,
      )}
    >
      {children ?? label}
    </span>
  );
}
