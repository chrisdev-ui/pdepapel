import { getBanners } from "@/actions/get-banners";
import { getBillboards } from "@/actions/get-billboards";
import { getMainBanner } from "@/actions/get-main-banner";
import { getProducts } from "@/actions/get-products";
import { BannersCta } from "@/components/banners-cta";
import { FeaturedProducts } from "@/components/featured-products";
import { Features } from "@/components/features";
import { HeroSlider } from "@/components/hero-slider";
import { MainBanner } from "@/components/main-banner";
import { NewArrivals } from "@/components/new-arrivals";
import { Newsletter } from "@/components/newsletter";

export const revalidate = 0;

export default async function HomePage() {
  const [billboards, featureProducts, mainBanner, newProducts, banners] =
    await Promise.all([
      getBillboards(),
      getProducts({ isFeatured: true, limit: 8 }),
      getMainBanner(),
      getProducts({ onlyNew: true, limit: 8 }),
      getBanners(),
    ]);

  return (
    <>
      <HeroSlider data={billboards} />
      <Features />
      <FeaturedProducts featureProducts={featureProducts} />
      <MainBanner data={mainBanner} />
      <NewArrivals newProducts={newProducts} />
      <BannersCta banners={banners} />
      <Newsletter />
    </>
  );
}
