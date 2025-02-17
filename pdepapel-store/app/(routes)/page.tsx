import { Metadata } from "next";
import dynamic from "next/dynamic";

import { getBanners } from "@/actions/get-banners";
import { getBillboards } from "@/actions/get-billboards";
import { getMainBanner } from "@/actions/get-main-banner";
import { getProducts } from "@/actions/get-products";
import { LIMIT_PER_ITEMS } from "@/constants";

const HeroSlider = dynamic(() => import("@/components/hero-slider"), {
  ssr: false,
});
const Features = dynamic(() => import("@/components/features"), { ssr: false });
const FeaturedProducts = dynamic(
  () => import("@/components/featured-products"),
  { ssr: false },
);
const MainBanner = dynamic(() => import("@/components/main-banner"), {
  ssr: false,
});
const NewArrivals = dynamic(() => import("@/components/new-arrivals"), {
  ssr: false,
});
const BannersCta = dynamic(() => import("@/components/banners-cta"), {
  ssr: false,
});

const Newsletter = dynamic(() => import("@/components/newsletter"), {
  ssr: false,
});

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
  const billboards = await getBillboards();
  const { products: featureProducts } = await getProducts({
    isFeatured: true,
    limit: LIMIT_PER_ITEMS,
  });
  const { products: newProducts } = await getProducts({
    onlyNew: true,
    limit: LIMIT_PER_ITEMS,
  });
  const mainBanner = await getMainBanner();
  const banners = await getBanners();

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
