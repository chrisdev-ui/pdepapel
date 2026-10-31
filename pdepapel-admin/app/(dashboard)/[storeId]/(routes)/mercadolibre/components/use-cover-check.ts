"use client";

import { useEffect, useState } from "react";

import { toGoogleMerchantImageUrl } from "@/lib/catalog-image-url";
import { inspectCoverPixels, type CoverInspection } from "@/lib/mercadolibre/picture-rules";

const COVER_SAMPLE_MAX_SIDE = 256;

function inspectLoadedCover(image: HTMLImageElement): CoverInspection | null {
  const { naturalWidth, naturalHeight } = image;
  if (naturalWidth <= 0 || naturalHeight <= 0) return null;
  const scale = Math.min(1, COVER_SAMPLE_MAX_SIDE / Math.max(naturalWidth, naturalHeight));
  const width = Math.max(1, Math.round(naturalWidth * scale));
  const height = Math.max(1, Math.round(naturalHeight * scale));
  try {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return null;
    context.drawImage(image, 0, 0, width, height);
    // Un lienzo «contaminado» por CORS lanza aquí; sin datos no se avisa nada.
    const { data } = context.getImageData(0, 0, width, height);
    const inspection = inspectCoverPixels({
      width,
      height,
      channels: 4,
      data: new Uint8Array(data.buffer, data.byteOffset, data.byteLength),
    });
    return inspection.reasons.some((reason) => reason.startsWith("No se pudo leer")) ? null : inspection;
  } catch {
    return null;
  }
}

/**
 * Revisa en el navegador si la portada parece un solo producto entero sobre
 * fondo blanco. Usa la misma copia de 1600 px que `usePictureChecks`, así que
 * no crea transformaciones nuevas en Cloudinary. Ante cualquier fallo devuelve null.
 */
export function useCoverCheck(url: string | null): CoverInspection | null {
  const [result, setResult] = useState<{ url: string; inspection: CoverInspection } | null>(null);

  useEffect(() => {
    if (!url || typeof window === "undefined") return;
    let cancelled = false;
    const image = new window.Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      if (cancelled) return;
      const inspection = inspectLoadedCover(image);
      if (inspection) setResult({ url, inspection });
    };
    image.src = toGoogleMerchantImageUrl(url);
    return () => {
      cancelled = true;
    };
  }, [url]);

  return result && result.url === url ? result.inspection : null;
}
