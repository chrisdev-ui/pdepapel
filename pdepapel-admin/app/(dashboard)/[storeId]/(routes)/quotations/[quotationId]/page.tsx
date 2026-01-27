import prismadb from "@/lib/prismadb";
import { QuotationForm } from "./components/quotation-form";

export default async function QuotationPage({
  params,
}: {
  params: { quotationId: string; storeId: string };
}) {
  const quotation =
    params.quotationId === "new"
      ? null
      : await prismadb.quotation.findUnique({
          where: {
            id: params.quotationId,
          },
          include: {
            items: true,
          },
        });

  const { getProducts } =
    await import("@/app/(dashboard)/[storeId]/(routes)/products/server/get-products");
  const rawProducts = await getProducts(params.storeId);

  // Transform products to match ProductForItem type (specifically productGroup null -> undefined)
  const products = rawProducts.map((product: any) => ({
    ...product,
    productGroup: product.productGroup || undefined,
  }));

  return (
    <div className="flex-col">
      <div className="flex-1 space-y-4 p-8 pt-6">
        <QuotationForm initialData={quotation} products={products} />
      </div>
    </div>
  );
}
