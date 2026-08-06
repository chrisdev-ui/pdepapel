import { getProducts } from "@/actions/get-products";
import { ProductList } from "@/components/product-list";

interface RelatedProductsProps {
  productsPromise: ReturnType<typeof getProducts>;
}

export async function RelatedProducts({
  productsPromise,
}: RelatedProductsProps) {
  const { products } = await productsPromise;

  return <ProductList title="Productos relacionados" products={products} />;
}
