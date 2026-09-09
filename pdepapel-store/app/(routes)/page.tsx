import { Metadata } from "next";
import { Suspense } from "react";
import { Organization, WebSite } from "schema-dts";

import { getCategories } from "@/actions/get-categories";
import { getHomeContent } from "@/actions/get-home-content";
import { getStorefrontSettings } from "@/actions/get-storefront-settings";
import { getTypes } from "@/actions/get-types";
import { CategoryChips } from "@/components/category-chips";
import { CampaignBanner } from "@/components/home/campaign-banner";
import { CategoryRail } from "@/components/home/category-rail";
import { FavoritesGrid, loadFavorites } from "@/components/home/favorites-section";
import { Hero } from "@/components/home/hero";
import { NewArrivalsRail } from "@/components/home/new-arrivals-rail";
import { ReviewsCarousel } from "@/components/home/reviews-carousel";
import { ProductRowSkeleton, RailSkeleton } from "@/components/home/skeletons";
import { Newsletter } from "@/components/newsletter";
import { BASE_URL } from "@/constants";
import { buildNavigationTypes } from "@/lib/catalog-navigation";
import { getCurrentSeason } from "@/lib/date-utils";
import { STOREFRONT_ROUTES } from "@/lib/routes";

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
        url: "/images/no-text-lightpink-bg.webp",
        width: 800,
        height: 600,
        alt: "Logo Papelería P de Papel",
      },
      {
        url: "/opengraph-image.png",
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

async function HomeCategoryChips() {
  const [types, categories] = await Promise.all([getTypes(), getCategories()]);
  return <CategoryChips types={buildNavigationTypes(types, categories)} />;
}

async function HomeCategories() {
  const categories = await getCategories();
  const featured = categories.filter(
    (category) => category.seoEnabled && category.seoFeatured && category.slug,
  );
  return <CategoryRail categories={featured} />;
}

async function HomeProducts() {
  const season = getCurrentSeason();
  const favorites = await loadFavorites();
  const campaign = getHomeContent().then((content) => content.campaign);

  return (
    <>
      <FavoritesGrid products={favorites} season={season} />
      <Suspense fallback={null}>
        <CampaignBanner campaign={await campaign} />
      </Suspense>
      <Suspense fallback={<RailSkeleton count={5} tile="h-72 w-56" />}>
        <NewArrivalsRail favorites={favorites} />
      </Suspense>
    </>
  );
}

export default async function HomePage() {
  const [content, settings] = await Promise.all([
    getHomeContent(),
    getStorefrontSettings(),
  ]);

  return (
    <>
      <Suspense fallback={null}>
        <HomeCategoryChips />
      </Suspense>
      <Hero content={content.hero} freeShippingThreshold={settings.freeShippingThreshold} />
      <Suspense fallback={<RailSkeleton count={6} tile="h-44 w-44 rounded-full" />}>
        <HomeCategories />
      </Suspense>
      <Suspense fallback={<ProductRowSkeleton />}>
        <HomeProducts />
      </Suspense>
      <Suspense fallback={null}>
        <ReviewsCarousel />
      </Suspense>
      <Newsletter source="portada-pie" />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
    </>
  );
}
