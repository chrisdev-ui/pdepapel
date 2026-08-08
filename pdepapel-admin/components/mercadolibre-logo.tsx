import Image from "next/image";

import { cn } from "@/lib/utils";

export function MercadoLibreLogo({
  className,
  variant = "mark",
}: {
  className?: string;
  variant?: "full" | "mark";
}) {
  const isFullLogo = variant === "full";

  return (
    <Image
      src={
        isFullLogo
          ? "/images/marketplaces/mercadolibre-logo.png"
          : "/images/marketplaces/mercadolibre-mark.png"
      }
      alt="Mercado Libre"
      width={isFullLogo ? 134 : 39}
      height={isFullLogo ? 34 : 28}
      className={cn("h-5 w-auto shrink-0 object-contain", className)}
    />
  );
}
