import { InventoryMovementType } from "@prisma/client";
import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { ProductKardexView } from "./components/product-kardex";
import { getProductKardex } from "./server/get-product-kardex";

export const revalidate = 0;
export const maxDuration = 60;

interface ProductKardexPageProps {
  params: { storeId: string; productId: string };
  searchParams?: {
    /** `todo=1` levanta la ventana de 90 días (queda el tope de 2.000). */
    todo?: string;
    /** Solo un tipo de movimiento (`InventoryMovementType`). */
    tipo?: string;
  };
}

const MOVEMENT_TYPES = new Set<string>(Object.values(InventoryMovementType));

function parseType(value: string | undefined): InventoryMovementType | null {
  const candidate = value?.trim();
  return candidate && MOVEMENT_TYPES.has(candidate) ? (candidate as InventoryMovementType) : null;
}

export async function generateMetadata({ params }: ProductKardexPageProps): Promise<Metadata> {
  const kardex = await getProductKardex(params.storeId, params.productId);
  return {
    title: kardex ? `Kardex · ${kardex.product.name} | PdePapel Admin` : "Kardex | PdePapel Admin",
    description: "Historial de movimientos con saldo de un producto.",
  };
}

export default async function ProductKardexPage({ params, searchParams }: ProductKardexPageProps) {
  const showAll = searchParams?.todo === "1";
  const typeFilter = parseType(searchParams?.tipo);
  const kardex = await getProductKardex(params.storeId, params.productId, { all: showAll, type: typeFilter ?? undefined });
  if (!kardex) notFound();

  return (
    <div className="p-4 sm:p-8 sm:pt-6">
      <ProductKardexView storeId={params.storeId} kardex={kardex} showAll={showAll} typeFilter={typeFilter} />
    </div>
  );
}
