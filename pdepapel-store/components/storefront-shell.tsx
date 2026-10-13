import { esES } from "@clerk/localizations";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/react";
import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import { getCategories } from "@/actions/get-categories";
import { getProducts } from "@/actions/get-products";
import { getStorefrontSettings } from "@/actions/get-storefront-settings";
import { getTypes } from "@/actions/get-types";
import { ClarityPrivacyBoundary } from "@/components/clarity-privacy-boundary";
import { Footer } from "@/components/footer";
import Navbar from "@/components/navbar";
import { Spooky } from "@/components/spooky";
import { WebVitalsReporter } from "@/components/web-vitals-reporter";
import { WishlistSyncProvider } from "@/components/wishlist-sync-provider";
import { buildFeaturedByType, buildFeaturedSubcategories, buildNavigationTypes } from "@/lib/catalog-navigation";
import { getCurrentSeason } from "@/lib/date-utils";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { CartPreviewProvider } from "@/providers/cart-preview-provider";
import { CustomerAnalyticsProvider } from "@/providers/customer-analytics-provider";
import { ModalProvider } from "@/providers/modal-provider";
import { ReactQueryProvider } from "@/providers/query-client-provider";
import { StorefrontSettingsProvider } from "@/providers/storefront-settings-provider";
import { Toaster } from "@/providers/toaster";
import { Season } from "@/types";

const Christmas = dynamic(() => import("@/components/christmas").then((mod) => mod.Christmas), { ssr: false });

// Sin versión fija, el CDN de Clerk sirve la última 5.x y cada publicación suya
// cambia lo que descarga cada página.
const CLERK_JS_VERSION = "5.128.0";

/**
 * «headless»: Clerk sin sus componentes de interfaz (sesión, token, salir). Va
 * en las páginas públicas. «full» solo en iniciar sesión, crear cuenta y Mi
 * cuenta, que usan `<SignIn>`, `<SignUp>` y el perfil de Clerk. Entre los dos
 * grupos se navega con carga completa de página (`StorefrontLink`).
 */
export type ClerkVariant = "headless" | "full";

export async function StorefrontShell({ clerkVariant, children }: { clerkVariant: ClerkVariant; children: ReactNode }) {
  const currentSeason = getCurrentSeason();
  // Header data: catalog tree for the drawer/mega menu, featured products for
  // the mega menu tile, and the public store settings for the announcement bar.
  const [types, categories, settings, featured] = await Promise.all([
    getTypes(),
    getCategories(),
    getStorefrontSettings(),
    getProducts({ isFeatured: true, limit: 60 }),
  ]);
  const navigationTypes = buildNavigationTypes(types, categories);
  const featuredByType = buildFeaturedByType(featured.products);
  const featuredSubcategories = buildFeaturedSubcategories(categories);

  return (
    <ClerkProvider
      clerkJSVersion={CLERK_JS_VERSION}
      clerkJSVariant={clerkVariant === "headless" ? "headless" : ""}
      localization={esES}
      signInUrl={STOREFRONT_ROUTES.signIn}
      signUpUrl={STOREFRONT_ROUTES.signUp}
      signInFallbackRedirectUrl={STOREFRONT_ROUTES.home}
      signUpFallbackRedirectUrl={STOREFRONT_ROUTES.home}
    >
      <ReactQueryProvider>
        <StorefrontSettingsProvider
          value={{
            freeShippingThreshold: settings.freeShippingThreshold,
            deliveryEstimate: settings.deliveryEstimate,
          }}
        >
          <CartPreviewProvider>
            <ModalProvider />
            <WishlistSyncProvider />
            <Navbar
              season={currentSeason}
              types={navigationTypes}
              featuredByType={featuredByType}
              featuredSubcategories={featuredSubcategories}
              freeShippingThreshold={settings.freeShippingThreshold}
            />
            <ClarityPrivacyBoundary>{children}</ClarityPrivacyBoundary>
            <Footer season={currentSeason} openingHoursLabel={settings.openingHoursLabel} />
            {currentSeason === Season.Christmas && <Christmas />}
            {currentSeason === Season.Spooky && <Spooky />}
          </CartPreviewProvider>
        </StorefrontSettingsProvider>
        <Toaster />
        <CustomerAnalyticsProvider
          measurementId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}
          clarityProjectId={process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID}
          clarityEnabled={process.env.NEXT_PUBLIC_CLARITY_ENABLED === "true"}
        />
        <Analytics />
        <WebVitalsReporter />
      </ReactQueryProvider>
    </ClerkProvider>
  );
}
