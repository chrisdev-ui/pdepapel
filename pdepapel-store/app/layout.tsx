import { esES } from "@clerk/localizations";
import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";

import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { caudex, comingSoon, martelSans, roboto } from "@/lib/fonts";
import { ModalProvider } from "@/providers/modal-provider";
import { Toaster } from "@/providers/toaster";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://papeleriapdepapel.com"),
  title: {
    default: "Papelería P de Papel",
    template: "%s | Papelería P de Papel",
  },
  description:
    "Descubre en Papelería P de Papel una encantadora selección de artículos kawaii y todo lo necesario para tu oficina o estudio. Cuadernos, accesorios, y más con un toque único. ¡Explora y embellece tu espacio de trabajo y estudio! - Contáctanos 3216299845",
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
  ],
  referrer: "origin-when-cross-origin",
  authors: [
    { name: "Christian Torres", url: "https://github.com/chrisdev-ui" },
  ],
  creator: "Christian Torres Martínez",
  publisher: "Vercel",
  formatDetection: {
    telephone: true,
    email: true,
    address: true,
  },
  alternates: {
    canonical: "/",
    languages: {
      "es-ES": "/es-ES",
    },
  },
  verification: {
    google: "bNg7w8CM30aKsixoCkhoBU7yhISJBm8isqVm6SrtBOY",
  },
  openGraph: {
    title: "Papelería P de Papel",
    description:
      "Descubre en Papelería P de Papel una encantadora selección de artículos kawaii y todo lo necesario para tu oficina o estudio. Cuadernos, accesorios, y más con un toque único. ¡Explora y embellece tu espacio de trabajo y estudio! - Contáctanos 3216299845",
    url: "https://papeleriapdepapel.com",
    siteName: "Papelería P de Papel",
    type: "website",
    locale: "es_ES",
  },
  twitter: {
    title: "Papelería P de Papel",
    description:
      "Descubre en Papelería P de Papel una encantadora selección de artículos kawaii y todo lo necesario para tu oficina o estudio. Cuadernos, accesorios, y más con un toque único. ¡Explora y embellece tu espacio de trabajo y estudio! - Contáctanos 3216299845",
    card: "summary_large_image",
    site: "Papelería P de Papel",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider localization={esES}>
      <html lang="en">
        <body
          className={`${caudex.variable} ${comingSoon.variable} ${martelSans.variable} ${roboto.variable}`}
        >
          <ModalProvider />
          <Navbar />
          {children}
          <Footer />
          <Toaster />
        </body>
      </html>
    </ClerkProvider>
  );
}
