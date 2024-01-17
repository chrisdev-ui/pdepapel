import prismadb from "@/lib/prismadb";
import { format } from "date-fns";
import { DesignsClient } from "./components/client";
import { DesignColumn } from "./components/columns";

export default async function DesignsPage({
  params,
}: {
  params: {
    storeId: string;
  };
}) {
  const designs = await prismadb.design.findMany({
    where: {
      storeId: params.storeId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  const formattedDesigns: DesignColumn[] = designs.map((design) => ({
    id: design.id,
    name: design.name,
    createdAt: format(design.createdAt, "MMMM d, yyyy"),
  }));

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <DesignsClient data={formattedDesigns} />
      </div>
    </div>
  );
}
