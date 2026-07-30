import dynamic from "next/dynamic";
import { getSizes } from "./server/get-sizes";

const SizesClient = dynamic(() => import("./components/client"), {
  ssr: false,
});

export const revalidate = 0;

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Tamaños | PdePapel Admin",
  description: "Gestión de tamaños",
};

export default async function SizesPage({
  params,
}: {
  params: {
    storeId: string;
  };
}) {
  const sizes = await getSizes(params.storeId);
  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <SizesClient data={sizes} />
      </div>
    </div>
  );
}
