import { Metadata } from "next";

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

export const metadata: Metadata = {
  title: "Inicio",
  description:
    "Bienvenido a Papelería P de Papel, tu destino en línea para encontrar los más encantadores artículos kawaii y una amplia gama de suministros de oficina. Descubre productos únicos y de calidad para agregar creatividad a tu espacio de trabajo o estudio. Experimenta una compra fácil y alegre con nosotros desde nuestra página principal.",
  alternates: {
    canonical: "/",
  },
};

export default async function HomePage() {
  const [
    billboards,
    { products: featureProducts },
    mainBanner,
    { products: newProducts },
    banners,
  ] = await Promise.all([
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
