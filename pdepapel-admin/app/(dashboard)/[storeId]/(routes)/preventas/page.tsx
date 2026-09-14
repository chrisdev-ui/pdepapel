import type { Metadata } from "next";
import dynamic from "next/dynamic";

import { getPresales } from "./server/get-presales";

const PresalesClient = dynamic(() => import("./components/client"), { ssr: false });

export const revalidate = 0;

export const metadata: Metadata = {
  title: "Preventas | PdePapel Admin",
  description: "Lo que ya se cobró y todavía no se ha despachado",
};

export default async function PresalesPage({
  params,
}: {
  params: { storeId: string };
}) {
  const data = await getPresales(params.storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-4 sm:p-8 sm:pt-6">
        <PresalesClient data={data} />
      </div>
    </div>
  );
}
