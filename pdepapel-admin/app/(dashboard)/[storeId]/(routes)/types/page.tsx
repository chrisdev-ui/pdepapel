import prismadb from "@/lib/prismadb";
import { format } from "date-fns";
import { TypeClient } from "./components/client";
import { TypeColumn } from "./components/columns";

export default async function TypesPage({
  params,
}: {
  params: {
    storeId: string;
  };
}) {
  const types = await prismadb.type.findMany({
    where: {
      storeId: params.storeId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const formattedTypes: TypeColumn[] = types.map((type) => ({
    id: type.id,
    name: type.name,
    createdAt: format(type.createdAt, "MMMM d, yyyy"),
  }));

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <TypeClient data={formattedTypes} />
      </div>
    </div>
  );
}
