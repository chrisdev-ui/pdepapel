import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GiftCardWorkspace } from "./components/gift-card-workspace";
import { getGiftCard } from "./server/get-gift-card";

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Tarjeta de regalo | PdePapel Admin",
};

export default async function GiftCardPage({ params }: { params: { storeId: string; giftCardId: string } }) {
  const card = await getGiftCard(params.storeId, params.giftCardId);
  if (!card) notFound();
  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 sm:p-8 sm:pt-6">
        <GiftCardWorkspace storeId={params.storeId} card={card} />
      </div>
    </div>
  );
}
