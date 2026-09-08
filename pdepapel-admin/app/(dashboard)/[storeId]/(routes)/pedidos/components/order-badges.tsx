import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

const TONES: Record<string, string> = {
  mint: "bg-tint-mint",
  cream: "bg-tint-cream",
  sky: "bg-tint-sky",
  slate: "bg-muted",
  pink: "bg-tint-pink",
  lavender: "bg-tint-lavender",
};

/** Insignia de estado con tinte pastel y texto oscuro (contraste AA). */
export function TintBadge({ label, tone, className }: { label: string; tone: string; className?: string }) {
  return (
    <Badge variant="outline" className={cn("whitespace-nowrap border-transparent font-semibold text-primary", TONES[tone] ?? "bg-muted", className)}>
      {label}
    </Badge>
  );
}

export const CHANNEL_TONE: Record<string, string> = {
  tienda: "sky",
  presencial: "pink",
  feria: "lavender",
  cotizacion: "lavender",
  personalizado: "cream",
};
