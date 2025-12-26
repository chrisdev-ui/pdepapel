import { getProducts } from "@/actions/get-products";
import FeaturedProducts from "@/components/featured-products";
import { LIMIT_PER_ITEMS } from "@/constants";

export const revalidate = 0;

export const FeaturedProductsSection = async () => {
  const { products } = await getProducts({
    isFeatured: true,
    limit: LIMIT_PER_ITEMS,
    groupBy: "parents",
  });

  return <FeaturedProducts featureProducts={products} />;
};
