"use client";

import { ImageOff } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

const SIZES = {
  sm: { box: "h-14 w-14", icon: "h-5 w-5" },
  lg: { box: "h-28 w-28 sm:h-32 sm:w-32", icon: "h-8 w-8" },
} as const;

/** Miniatura efímera (Meta y TikTok la vencen): si no carga, un marcador neutro; nunca se copia a otro servidor. */
export function PostThumbnail({ src, alt, size = "sm" }: { src: string | null; alt: string; size?: keyof typeof SIZES }) {
  const [failed, setFailed] = useState(false);
  const { box, icon } = SIZES[size];
  if (!src || failed) {
    return (
      <span
        className={cn("flex shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground", box)}
        aria-hidden
        data-testid="miniatura-vacia"
      >
        <ImageOff className={icon} />
      </span>
    );
  }
  return (
    // Dirección externa que vence en horas: no pasa por el cargador de Cloudinary.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={cn("shrink-0 rounded-lg object-cover", box)}
    />
  );
}
