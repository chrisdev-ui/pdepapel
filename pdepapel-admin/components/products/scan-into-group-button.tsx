"use client";

import axios from "axios";
import { useParams } from "next/navigation";

import { ProductScanButton } from "@/components/ui/product-scan-button";
import { useToast } from "@/hooks/use-toast";

/** La misma fila que devuelve «Traer existentes» (search/products/isolated). */
export interface AdoptableProduct {
  id: string;
  name: string;
  category: { id: string; name: string };
  size?: { id: string; name: string; value: string };
  color?: { id: string; name: string; value: string };
  design?: { id: string; name: string };
  images: { url: string }[];
  price: number;
  sku?: string;
  acqPrice?: number;
  stock?: number;
  supplierId?: string;
  isFeatured?: boolean;
  isArchived?: boolean;
  description?: string | null;
  gtin?: string | null;
  mpn?: string | null;
  hasNoProductIdentifier?: boolean;
  slug?: string;
}

interface ScanIntoGroupButtonProps {
  /** El mismo manejador que «Traer existentes»: hereda su deduplicación y sus avisos. */
  onImport: (products: AdoptableProduct[]) => void;
  compact?: boolean;
  disabled?: boolean;
  /** `sm` para ir junto a los botones pequeños de la cabecera del formulario. */
  size?: "default" | "sm";
}

/**
 * Escanear para traer un producto suelto al grupo. Resuelve el código a un
 * producto y luego pregunta al mismo endpoint de «Traer existentes» por ese
 * id: si no vuelve, es porque ya pertenece a otro grupo o está archivado, y
 * se rechaza con la misma regla que la lista.
 */
export function ScanIntoGroupButton({ onImport, compact = true, disabled = false, size = "sm" }: ScanIntoGroupButtonProps) {
  const params = useParams();
  const storeId = String(params?.storeId ?? "");
  const { toast } = useToast();

  if (disabled) return null;

  return (
    <ProductScanButton
      compact={compact}
      size={size}
      label="Escanear producto para traerlo"
      description="Apunta al QR de una etiqueta o al código de barras de un producto suelto para traerlo al grupo."
      onFound={async (product) => {
        try {
          const response = await axios.get(`/api/${storeId}/search/products/isolated`, { params: { id: product.id, limit: 1 } });
          // La API manda null en las relaciones vacías; el formulario las lee con `?.`, como en la lista.
          const row = (response.data?.data as AdoptableProduct[] | undefined)?.[0];
          if (!row) {
            toast({
              title: "No se puede traer al grupo",
              description: `«${product.name}» ya pertenece a otro grupo o está archivado. Solo se traen productos sueltos a la venta.`,
              variant: "destructive",
            });
            return;
          }
          onImport([row]);
        } catch {
          toast({ title: "No se pudo comprobar el producto", description: "Revisa la conexión e inténtalo de nuevo.", variant: "destructive" });
        }
      }}
    />
  );
}
