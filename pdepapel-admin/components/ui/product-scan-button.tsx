"use client";

import type { AsyncProductOption } from "@/components/ui/async-product-select";
import { BarcodeScanner } from "@/components/ui/barcode-scanner";
import { useProductScanLookup } from "@/hooks/use-product-scan-lookup";
import { useParams } from "next/navigation";

import { useToast } from "@/hooks/use-toast";
import { scanAccepted, scanRejected, settleScan, type ScanOutcome, type ScanResult } from "@/lib/scan-outcome";

interface ProductScanButtonProps {
  /**
   * Recibe el producto resuelto: cada pantalla decide dónde cae (elegirlo,
   * agregarlo, abrir su ficha). Puede devolver `scanRejected()` si lo
   * encontrado no le sirve —un producto que ya está en otro grupo, por
   * ejemplo— y entonces el lector suena a rechazo en vez de a aceptado.
   */
  onFound: (product: AsyncProductOption) => ScanResult;
  /** Solo el icono en celular. */
  compact?: boolean;
  label?: string;
  description?: string;
  className?: string;
  /** Aviso al encontrarlo; útil cuando la pantalla no muestra la elección de inmediato. */
  notify?: boolean;
  storeId?: string;
  /** `sm` para cabeceras de sección con botones pequeños. */
  size?: "default" | "sm";
}

/**
 * Escanear para encontrar un producto: la cámara local o el celular
 * vinculado leen un QR de etiqueta, un SKU o un GTIN, y el producto se
 * resuelve por la búsqueda (sin control de stock: un producto agotado
 * también se elige). Es el mismo botón en todas las pantallas que buscan un
 * producto; la venta de Vender mantiene su propio lector con control de stock.
 */
export function ProductScanButton({
  onFound,
  compact = false,
  label = "Escanear",
  description = "Apunta al QR de una etiqueta o al código de barras del empaque.",
  className,
  notify = false,
  storeId: storeIdOverride,
  size = "default",
}: ProductScanButtonProps) {
  const params = useParams();
  const storeId = storeIdOverride ?? String(params?.storeId ?? "");
  const { resolve } = useProductScanLookup(storeId);
  const { toast } = useToast();

  async function onDetected(code: string): Promise<ScanOutcome> {
    const product = await resolve(code);
    if (!product) {
      toast({
        title: "No encontramos ese código",
        description: `«${code}» no coincide con ningún SKU, código de barras ni QR de etiqueta.`,
        variant: "destructive",
      });
      return scanRejected();
    }
    if (notify) toast({ title: "Producto encontrado", description: product.name, variant: "success" });
    // El pitido lo pone el lector para las nueve pantallas de una vez: antes
    // solo dos avisaban con un toast y las otras siete no confirmaban nada.
    const outcome = await settleScan(() => onFound(product));
    return outcome.ok ? scanAccepted(product.name) : scanRejected(product.name);
  }

  // `storeId` también al lector: antes solo llegaba a la búsqueda y el lector
  // lo sacaba siempre de la ruta, así que fuera de una ruta con `[storeId]`
  // el celular vinculado se habría quedado sin tienda a la que preguntar.
  return <BarcodeScanner onDetected={onDetected} description={description} label={label} compact={compact} className={className} size={size} storeId={storeId} />;
}
