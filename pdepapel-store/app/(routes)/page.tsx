import { Metadata } from "next";
import dynamic from "next/dynamic";

import { getBanners } from "@/actions/get-banners";
import { getBillboards } from "@/actions/get-billboards";
import { getMainBanner } from "@/actions/get-main-banner";
import { getProducts } from "@/actions/get-products";

const HeroSlider = dynamic(
  () => import("@/components/hero-slider").then((mod) => mod.HeroSlider),
  { ssr: false },
);
const Features = dynamic(
  () => import("@/components/features").then((mod) => mod.Features),
  { ssr: false },
);
const FeaturedProducts = dynamic(
  () =>
    import("@/components/featured-products").then(
      (mod) => mod.FeaturedProducts,
    ),
  { ssr: false },
);
const MainBanner = dynamic(
  () => import("@/components/main-banner").then((mod) => mod.MainBanner),
  {
    ssr: false,
  },
);
const NewArrivals = dynamic(
  () => import("@/components/new-arrivals").then((mod) => mod.NewArrivals),
  {
    ssr: false,
  },
);
const BannersCta = dynamic(
  () => import("@/components/banners-cta").then((mod) => mod.BannersCta),
  {
    ssr: false,
  },
);

const Newsletter = dynamic(
  () => import("@/components/newsletter").then((mod) => mod.Newsletter),
  {
    ssr: false,
  },
);

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
