"use client";

import type { AsyncProductOption } from "@/components/ui/async-product-select";
import { BarcodeScanner } from "@/components/ui/barcode-scanner";
import { useProductScanLookup } from "@/hooks/use-product-scan-lookup";
import { useToast } from "@/hooks/use-toast";

interface ProductScanButtonProps {
  /** Recibe el producto resuelto: cada pantalla decide dónde cae (elegirlo, agregarlo, abrir su ficha). */
  onFound: (product: AsyncProductOption) => void;
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
  storeId,
  size = "default",
}: ProductScanButtonProps) {
  const { resolve } = useProductScanLookup(storeId);
  const { toast } = useToast();

  async function onDetected(code: string) {
    const product = await resolve(code);
    if (!product) {
      toast({
        title: "No encontramos ese código",
        description: `«${code}» no coincide con ningún SKU, código de barras ni QR de etiqueta.`,
        variant: "destructive",
      });
      return;
    }
    if (notify) toast({ title: "Producto encontrado", description: product.name, variant: "success" });
    onFound(product);
  }

  return <BarcodeScanner onDetected={(code) => void onDetected(code)} description={description} label={label} compact={compact} className={className} size={size} />;
}
