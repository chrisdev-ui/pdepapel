import type { Metadata } from "next";

import { requireStoreOwner } from "@/lib/store-access";

import { EditionsClient } from "./components/editions-client";
import { getEditions } from "./server/get-editions";

export const metadata: Metadata = { title: "Ediciones de cápsulas" };

export default async function EdicionesPage({ params }: { params: { storeId: string } }) {
  await requireStoreOwner(params.storeId);
  const editions = await getEditions(params.storeId);
  return (
    <div className="flex flex-col gap-6 p-4 pt-6 md:p-8">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight text-primary">Ediciones de cápsulas</h1>
        <p className="text-sm text-muted-foreground">
          Cada cápsula es un papel con QR que corresponde a un producto real. Los papeles impresos quedan apartados: la tienda, Mercado Libre y el punto de venta no venden esas unidades.
        </p>
      </div>
      <EditionsClient editions={editions} />
    </div>
  );
}
