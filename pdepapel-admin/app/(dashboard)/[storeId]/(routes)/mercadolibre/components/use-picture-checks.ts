"use client";

import { useEffect, useState } from "react";

import { toGoogleMerchantImageUrl } from "@/lib/catalog-image-url";
import type { ListingWizardImageCheck } from "@/lib/mercadolibre/listing-wizard";

/**
 * Tamaño real de cada foto tal como la descargará Mercado Libre (la copia de
 * 1600 px que ya usan los feeds), para avisar antes de publicar si alguna no
 * llega al mínimo. No crea transformaciones nuevas en Cloudinary.
 */
export function usePictureChecks(urls: readonly string[]) {
  const [checks, setChecks] = useState<Record<string, ListingWizardImageCheck>>({});
  const key = urls.join("\n");

  useEffect(() => {
    let cancelled = false;
    const list = key ? key.split("\n") : [];
    setChecks((current) => {
      const next: Record<string, ListingWizardImageCheck> = {};
      for (const url of list) next[url] = current[url] ?? "pending";
      return next;
    });
    for (const url of list) {
      const image = new window.Image();
      image.onload = () => {
        if (cancelled) return;
        setChecks((current) => ({ ...current, [url]: { width: image.naturalWidth, height: image.naturalHeight } }));
      };
      image.onerror = () => {
        if (cancelled) return;
        setChecks((current) => ({ ...current, [url]: "error" }));
      };
      image.src = toGoogleMerchantImageUrl(url);
    }
    return () => {
      cancelled = true;
    };
  }, [key]);

  return checks;
}
