import { getBillboards } from "@/actions/get-billboards";
import { getProducts } from "@/actions/get-products";
import { FeaturedProducts } from "@/components/featured-products";
import { Features } from "@/components/features";
import { HeroSlider } from "@/components/hero-slider";

export const revalidate = 0;

export default async function HomePage() {
  const billboards = await getBillboards();
  const featureProducts = await getProducts({ isFeatured: true });
  return (
    <>
      <HeroSlider data={billboards} />
      <Features />
      <FeaturedProducts featureProducts={featureProducts} />
    </>
  );
}
