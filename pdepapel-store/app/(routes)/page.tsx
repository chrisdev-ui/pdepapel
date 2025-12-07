import { Metadata } from "next";
import { Organization, WebSite } from "schema-dts";

import { getBanners } from "@/actions/get-banners";
import { getBillboards } from "@/actions/get-billboards";
import { getMainBanner } from "@/actions/get-main-banner";
import { getProducts } from "@/actions/get-products";
import { BASE_URL, LIMIT_PER_ITEMS } from "@/constants";

import BannersCta from "@/components/banners-cta";
import FeaturedProducts from "@/components/featured-products";
import Features from "@/components/features";
import HeroSlider from "@/components/hero-slider";
import MainBanner from "@/components/main-banner";
import NewArrivals from "@/components/new-arrivals";
import Newsletter from "@/components/newsletter";

export const revalidate = 60;

const jsonLd: {
  "@context": "https://schema.org";
  "@graph": (Organization | WebSite)[];
} = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      name: "Papelería P de Papel",
      url: BASE_URL,
      logo: `${BASE_URL}/images/no-text-lightpink-bg.webp`,
      contactPoint: {
        "@type": "ContactPoint",
        telephone: "+57-313-258-2293",
        contactType: "customer service",
        areaServed: "CO",
        availableLanguage: "es",
      },
      sameAs: [
        "https://instagram.com/papeleria.pdepapel",
        "https://tiktok.com/@papeleria.pdepapel",
      ],
    },
    {
      "@type": "WebSite",
      name: "Papelería P de Papel",
      url: BASE_URL,
      potentialAction: {
        "@type": "SearchAction",
        target: {
          "@type": "EntryPoint",
          urlTemplate: `${BASE_URL}/shop?search={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      } as any,
    },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: "Inicio | Papelería P de Papel",
  description:
    "Bienvenido a Papelería P de Papel, tu destino en línea para encontrar los más encantadores artículos kawaii y una amplia gama de suministros de oficina. Descubre productos únicos y de calidad para agregar creatividad a tu espacio de trabajo o estudio. Experimenta una compra fácil y alegre con nosotros desde nuestra página principal.",
  keywords: [
    "papelería kawaii",
    "útiles escolares",
    "oficina",
    "regalos originales",
    "arte",
    "manualidades",
    "colombia",
    "envíos nacionales",
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Inicio | Papelería P de Papel",
    description:
      "Bienvenido a Papelería P de Papel, tu destino en línea para encontrar los más encantadores artículos kawaii y una amplia gama de suministros de oficina.",
    url: "/",
    siteName: "Papelería P de Papel",
    locale: "es_CO",
    type: "website",
    images: [
      {
        url: "/images/no-text-lightpink-bg.webp", // Using logo/brand image
        width: 800,
        height: 600,
        alt: "Logo Papelería P de Papel",
      },
      {
        url: "/opengraph-image.png", // Fallback to general OG image
        width: 1200,
        height: 630,
        alt: "Papelería P de Papel",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Inicio | Papelería P de Papel",
    description:
      "Bienvenido a Papelería P de Papel, tu destino en línea para encontrar los más encantadores artículos kawaii.",
    images: ["/images/no-text-lightpink-bg.webp"],
  },
};

export default async function HomePage() {
  const [
    billboards,
    { products: featureProducts },
    { products: newProducts },
    mainBanner,
    banners,
  ] = await Promise.all([
    getBillboards(),
    getProducts({ isFeatured: true, limit: LIMIT_PER_ITEMS }),
    getProducts({ onlyNew: true, limit: LIMIT_PER_ITEMS }),
    getMainBanner(),
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
