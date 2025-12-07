import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { getOffers } from "./server/get-offers";

const OffersClient = dynamic(() => import("./components/client"), {
  ssr: false,
});

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Ofertas | PdePapel Admin",
  description: "Gestión de descuentos y promociones",
};

export default async function OffersPage({
  params,
}: {
  params: {
    storeId: string;
  };
}) {
  const offers = await getOffers(params.storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <OffersClient data={offers} />
      </div>
    </div>
  );
}
