import dynamic from "next/dynamic";
import { getTypes } from "./server/get-types";

const TypeClient = dynamic(() => import("./components/client"), {
  ssr: false,
});

export const revalidate = 0;

export default async function TypesPage({
  params,
}: {
  params: {
    storeId: string;
  };
}) {
  const types = await getTypes(params.storeId);

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <TypeClient data={types} />
      </div>
    </div>
  );
}
