import { Metadata } from "next";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import { Organization, WebSite } from "schema-dts";

import { getBillboards } from "@/actions/get-billboards";
import { BASE_URL } from "@/constants";

import Features from "@/components/features";

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

import HeroSlider from "@/components/hero-slider";
const Newsletter = dynamic(() => import("@/components/newsletter"));

import {
  BannersCtaSkeleton,
  FeaturedProductsSkeleton,
  MainBannerSkeleton,
  NewArrivalsSkeleton,
} from "@/components/home-skeletons";

import { BannersCtaSection } from "./components/banners-cta-section";
import { FeaturedProductsSection } from "./components/featured-products-section";
import { MainBannerSection } from "./components/main-banner-section";
import { NewArrivalsSection } from "./components/new-arrivals-section";

export default async function HomePage() {
  const billboards = await getBillboards();

  return (
    <>
      <HeroSlider data={billboards} />
      <Features />
      <Suspense fallback={<FeaturedProductsSkeleton />}>
        <FeaturedProductsSection />
      </Suspense>
      <Suspense fallback={<MainBannerSkeleton />}>
        <MainBannerSection />
      </Suspense>
      <Suspense fallback={<NewArrivalsSkeleton />}>
        <NewArrivalsSection />
      </Suspense>
      <Suspense fallback={<BannersCtaSkeleton />}>
        <BannersCtaSection />
      </Suspense>
      <Newsletter />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
