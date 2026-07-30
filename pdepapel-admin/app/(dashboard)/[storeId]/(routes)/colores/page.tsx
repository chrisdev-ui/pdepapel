import dynamic from "next/dynamic";
import { getColors } from "./server/get-colors";

const ColorsClient = dynamic(() => import("./components/client"), {
  ssr: false,
});

export const revalidate = 0;

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Colores | PdePapel Admin",
  description: "Gestión de colores",
};

export default async function ColorsPage({
  params,
}: {
  params: {
    storeId: string;
  };
}) {
  const colors = await getColors(params.storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <ColorsClient data={colors} />
      </div>
    </div>
  );
}
