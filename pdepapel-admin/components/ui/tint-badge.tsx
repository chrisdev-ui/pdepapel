import { badgeVariants } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

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
export function TintBadge({ label, tone, className }: { label: string; tone: string; className?: string }) {
  // Un <span>: cabe dentro de párrafos y celdas sin romper el HTML (un div dentro de <p> rompe la hidratación).
  return <span className={cn(badgeVariants({ variant: "outline" }), "whitespace-nowrap border-transparent font-semibold text-primary", TONES[tone] ?? "bg-muted", className)}>{label}</span>;
}
