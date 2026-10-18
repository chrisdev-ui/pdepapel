import { getProducts } from "@/actions/get-products";
import { ProductList } from "@/components/product-list";

interface RelatedProductsProps {
  productsPromise: ReturnType<typeof getProducts>;
  title?: string;
  eyebrow?: string;
  action?: { label: string; href: string; prefetch?: boolean };
  minProducts?: number;
  hideBrand?: boolean;
}

export async function RelatedProducts({ productsPromise, title = "También te puede gustar", eyebrow, action, minProducts, hideBrand }: RelatedProductsProps) {
  const { products } = await productsPromise;

  return <ProductList title={title} products={products} eyebrow={eyebrow} action={action} hideWhenEmpty minProducts={minProducts} hideBrand={hideBrand} />;
}
