import prismadb from "@/lib/prismadb";
import { RestockOrderForm } from "./components/restock-order-form";

export default async function RestockOrderPage({
  params,
}: {
  params: { restockOrderId: string; storeId: string };
}) {
  const restockOrder =
    params.restockOrderId === "new"
      ? null
      : await prismadb.restockOrder.findUnique({
          where: {
            id: params.restockOrderId,
          },
          include: {
            items: {
              include: {
                product: true,
              },
            },
          },
        });

  const suppliers = await prismadb.supplier.findMany({
    where: {
      storeId: params.storeId,
    },
  });

  const products = await prismadb.product.findMany({
    where: {
      storeId: params.storeId,
      isArchived: false,
    },
    select: {
      id: true,
      name: true,
      sku: true,
      acqPrice: true,
      stock: true,
    },
  });

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <RestockOrderForm
          initialData={restockOrder}
          suppliers={suppliers}
          products={products}
        />
      </div>
    </div>
  );
}
