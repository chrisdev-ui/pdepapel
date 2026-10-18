import Image from "next/image";

import { cn } from "@/lib/utils";

/** Logo de la marca en una ficha blanca, o «Sin logo» rotulado. El nombre va al lado: alt vacío. */
export function BrandLogoTile({
  logoUrl,
  size = "md",
  className,
}: {
  logoUrl: string | null;
  size?: "sm" | "md";
  className?: string;
}) {
  const box = size === "sm" ? "h-10 w-10" : "h-14 w-[4.5rem]";
  if (!logoUrl) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-lg border border-dashed border-muted-foreground/50 bg-muted/40 text-center text-[11px] font-semibold leading-tight text-muted-foreground",
          box,
          className,
        )}
      >
        Sin logo
      </span>
    );
  }
  return (
    <span className={cn("relative flex shrink-0 overflow-hidden rounded-lg border bg-white p-1.5", box, className)}>
      <span className="relative h-full w-full">
        <Image src={logoUrl} alt="" fill sizes="80px" className="object-contain" />
      </span>
    </span>
  );
}
