import { getProduct } from "@/actions/get-product";
import { getProducts } from "@/actions/get-products";
import { SingleProductPage } from "@/components/single-product-page";

interface ProductPageProps {
  params: {
    productId: string;
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const product = await getProduct(params.productId);
  const suggestedProducts = await getProducts({
    categoryId: product?.category?.id,
    excludeProducts: params.productId,
    limit: 4,
  });
  return (
    <SingleProductPage
      product={product}
      suggestedProducts={suggestedProducts}
    />
  );
}
