import { esES } from "@clerk/localizations";
import { ClerkProvider } from "@clerk/nextjs";
import { Analytics } from "@vercel/analytics/react";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";

import { Footer } from "@/components/footer";
import { Spooky } from "@/components/spooky";
import { getCurrentSeason } from "@/lib/date-utils";
import { beautifulEveryTime, caudex, fredoka, quicksand } from "@/lib/fonts";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { ModalProvider } from "@/providers/modal-provider";
import { ReactQueryProvider } from "@/providers/query-client-provider";
import { CustomerAnalyticsProvider } from "@/providers/customer-analytics-provider";
import { Toaster } from "@/providers/toaster";
import { WishlistSyncProvider } from "@/components/wishlist-sync-provider";
import { Season } from "@/types";
import "./globals.css";

import dynamic from "next/dynamic";

const Christmas = dynamic(
  () => import("@/components/christmas").then((mod) => mod.Christmas),
  {
    ssr: false,
  },
);

import Navbar from "@/components/navbar";

export const metadata: Metadata = {
  metadataBase: new URL("https://papeleriapdepapel.com"),
  title: {
    default: "Papelería P de Papel",
    template: "%s | Papelería P de Papel",
  },
  description:
    "Descubre en Papelería P de Papel una encantadora selección de artículos kawaii y todo lo necesario para tu oficina o estudio. Cuadernos, accesorios, y más con un toque único. ¡Explora y embellece tu espacio de trabajo y estudio! - Contáctanos 3132582293",
  applicationName: "Papelería P de Papel",
  keywords: [
    "Papelería kawaii",
    "Suministros de oficina",
    "Artículos de papelería",
    "Cuadernos kawaii",
    "Accesorios de escritorio",
    "Material escolar",
    "Papelería online",
    "Bolígrafos bonitos",
    "Papelería creativa",
    "Tienda de papelería",
    "Organización de oficina",
    "Artículos de escritura",
    "Papelería para estudiantes",
    "Regalos de papelería",
    "Papelería japonesa",
    "P de Papel",
    "Papelería P de Papel",
    "Calendario de adviento",
    "Calendario de navidad",
    "Harry Potter",
    "Marcadores",
    "Lapiceros",
    "Cartucheras",
    "Cuadernos",
    "Llaveros",
    "Utiles escolares",
  ],
  referrer: "origin-when-cross-origin",
  authors: [
    { name: "Christian Torres", url: "https://github.com/chrisdev-ui" },
  ],
  creator: "Christian Torres Martínez",
  generator: "Next.js",
  publisher: "Vercel",
  formatDetection: {
    telephone: true,
    email: true,
    address: true,
  },
  alternates: {
    canonical: "/",
  },
  verification: {
    google: "bNg7w8CM30aKsixoCkhoBU7yhISJBm8isqVm6SrtBOY",
  },
  openGraph: {
    title: "Papelería P de Papel",
    description:
      "Descubre en Papelería P de Papel una encantadora selección de artículos kawaii y todo lo necesario para tu oficina o estudio. Cuadernos, accesorios, y más con un toque único. ¡Explora y embellece tu espacio de trabajo y estudio! - Contáctanos 3132582293",
    url: "https://papeleriapdepapel.com",
    siteName: "Papelería P de Papel",
    type: "website",
    locale: "es_CO",
  },
  twitter: {
    title: "Papelería P de Papel",
    description:
      "Descubre en Papelería P de Papel una encantadora selección de artículos kawaii y todo lo necesario para tu oficina o estudio. Cuadernos, accesorios, y más con un toque único. ¡Explora y embellece tu espacio de trabajo y estudio! - Contáctanos 3132582293",
    card: "summary_large_image",
    site: "Papelería P de Papel",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const currentSeason = getCurrentSeason();

  return (
    <ClerkProvider
      localization={esES}
      signInUrl={STOREFRONT_ROUTES.signIn}
      signUpUrl={STOREFRONT_ROUTES.signUp}
      afterSignInUrl={STOREFRONT_ROUTES.home}
      afterSignUpUrl={STOREFRONT_ROUTES.home}
    >
      <html lang="es" suppressHydrationWarning>
        <body
          className={`${beautifulEveryTime.variable} ${caudex.variable} ${fredoka.variable} ${quicksand.variable}`}
        >
          <link rel="dns-prefetch" href="https://res.cloudinary.com" />
          <link rel="preconnect" href="https://res.cloudinary.com" />
          <ReactQueryProvider>
            <ModalProvider />
            <WishlistSyncProvider />
            <Navbar season={currentSeason} />
            <main>{children}</main>
            <Footer season={currentSeason} />
            {currentSeason === Season.Christmas && <Christmas />}
            {currentSeason === Season.Spooky && <Spooky />}
            <Toaster />
            <CustomerAnalyticsProvider
              measurementId={process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID}
            />
            <Analytics />
            <SpeedInsights />
          </ReactQueryProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
