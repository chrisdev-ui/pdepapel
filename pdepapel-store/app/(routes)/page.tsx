import { Metadata } from "next";
import dynamic from "next/dynamic";
import { Suspense } from "react";
import { Organization, WebSite } from "schema-dts";

import { getBillboards } from "@/actions/get-billboards";
import { getCategories } from "@/actions/get-categories";
import { CategoryLinksSection } from "@/components/category-links-section";
import { BASE_URL } from "@/constants";
import { getCurrentSeason } from "@/lib/date-utils";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { Season } from "@/types";

import Features from "@/components/features";

export const revalidate = 300;

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
          urlTemplate: `${BASE_URL}${STOREFRONT_ROUTES.shop}?search={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      } as any,
    },
  ],
};

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: "Papelería kawaii en Colombia",
  description:
    "Compra papelería kawaii, agendas, cuadernos, útiles escolares y regalos creativos con envíos a toda Colombia. Descubre novedades en Papelería P de Papel.",
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
    title: "Papelería kawaii en Colombia | Papelería P de Papel",
    description:
      "Papelería kawaii, útiles escolares y regalos creativos con envíos a toda Colombia.",
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
    title: "Papelería kawaii en Colombia | Papelería P de Papel",
    description:
      "Papelería kawaii, útiles escolares y regalos creativos con envíos a toda Colombia.",
    images: ["/images/no-text-lightpink-bg.webp"],
  },
};

import HeroSlider from "@/components/hero-slider";
const Newsletter = dynamic(() => import("@/components/newsletter"));

import { BannersCtaSection } from "@/components/banners-cta-section";
import { FeaturedProductsSection } from "@/components/featured-products-section";
import {
  BannersCtaSkeleton,
  CategoryLinksSkeleton,
  FeaturedProductsSkeleton,
  HeroSliderSkeleton,
  MainBannerSkeleton,
  NewArrivalsSkeleton,
} from "@/components/home-skeletons";
import { MainBannerSection } from "@/components/main-banner-section";
import { NewArrivalsSection } from "@/components/new-arrivals-section";

async function HomeHero({ season }: { season: Season }) {
  const billboards = await getBillboards();

  return <HeroSlider data={billboards} season={season} />;
}

async function HomeCategoryLinks() {
  const categories = await getCategories();
  const seoCategories = categories.filter(
    (category) => category.seoEnabled && category.seoFeatured && category.slug,
  );

  return <CategoryLinksSection categories={seoCategories} />;
}

export default function HomePage() {
  const season = getCurrentSeason();

  return (
    <>
      <section className="bg-kawaii-pink-light/15 py-8 text-center">
        <h1 className="text-balance font-serif text-3xl font-extrabold sm:text-4xl">
          Papelería kawaii desde Medellín con envíos a toda Colombia
        </h1>
        <p className="text-pretty mx-auto mt-3 max-w-2xl px-6 text-muted-foreground">
          Somos una tienda online colombiana. Desde Medellín enviamos agendas,
          cuadernos, útiles escolares y regalos kawaii a todo el país.
        </p>
      </section>
      <Suspense fallback={<HeroSliderSkeleton />}>
        <HomeHero season={season} />
      </Suspense>
      <Features />
      <Suspense fallback={<CategoryLinksSkeleton />}>
        <HomeCategoryLinks />
      </Suspense>
      <Suspense fallback={<FeaturedProductsSkeleton />}>
        <FeaturedProductsSection season={season} />
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
