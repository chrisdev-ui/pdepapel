import { getProducts } from "@/actions/get-products";
import NewArrivals from "@/components/new-arrivals";
import { LIMIT_PER_ITEMS } from "@/constants";

export const NewArrivalsSection = async () => {
  const { products } = await getProducts({
    onlyNew: true,
    limit: LIMIT_PER_ITEMS,
  });

  return <NewArrivals newProducts={products} />;
};
