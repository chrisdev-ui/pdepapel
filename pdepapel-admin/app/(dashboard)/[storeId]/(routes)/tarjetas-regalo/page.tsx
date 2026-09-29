import type { Metadata } from "next";
import dynamic from "next/dynamic";

import { getGiftCards } from "./server/get-gift-cards";

const GiftCardsClient = dynamic(() => import("./components/client"), { ssr: false });

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Tarjetas de regalo | PdePapel Admin",
  description: "Tarjetas de regalo vendidas, su saldo y los valores a la venta.",
};

export default async function GiftCardsPage({ params }: { params: { storeId: string } }) {
  const data = await getGiftCards(params.storeId);
  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 sm:p-8 sm:pt-6">
        <GiftCardsClient
          cards={data.cards}
          denominations={data.denominations}
          canWrite={data.canWrite}
        />
      </div>
    </div>
  );
}
