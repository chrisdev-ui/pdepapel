import { CardBadge } from "@/lib/product-card";
import { cn } from "@/lib/utils";

/** Mismos tonos que la etiqueta de la tarjeta de producto. */
const TONES: Record<CardBadge["tone"], string> = {
  soldOut: "bg-red-600 text-white",
  comingSoon: "bg-kawaii-lavender-light text-blue-yankees",
  offer: "bg-yellow-star text-blue-yankees",
  options: "bg-kawaii-lavender-light text-blue-yankees",
  new: "bg-pink-shell text-blue-yankees",
};

export function ProductBadge({ badge, className }: { badge: CardBadge; className?: string }) {
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 font-sans text-xs font-bold", TONES[badge.tone], className)}>
      {badge.text}
    </span>
  );
}
