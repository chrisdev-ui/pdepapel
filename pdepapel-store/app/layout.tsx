import type { Metadata } from "next";
import { HISTORY_GUARD_SCRIPT } from "@/lib/history-guard";
import { beautifulEveryTime, caudex, fredoka, quicksand } from "@/lib/fonts";
import "./globals.css";

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
    "Papelería bonita",
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
  // Sin canónica aquí: cada página indexable declara la suya
  // (tests/unit/app/canonical-per-template.test.ts). Heredar «/» hacía que
  // los 404 y cualquier página nueva sin canónica apuntaran al inicio.
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

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className={`${beautifulEveryTime.variable} ${caudex.variable} ${fredoka.variable} ${quicksand.variable}`}>
        {/* Antes de hidratar: los navegadores integrados de Android envuelven
            history.pushState y su puente puede lanzar en cada navegación con
            clic (incidente 2026-10-06, lib/history-guard.ts). Texto fijo. */}
        <script dangerouslySetInnerHTML={{ __html: HISTORY_GUARD_SCRIPT }} />
        <link rel="dns-prefetch" href="https://res.cloudinary.com" />
        <link rel="preconnect" href="https://res.cloudinary.com" />
        {/* La cabecera, Clerk y los proveedores van en el layout de cada grupo
            (components/storefront-shell.tsx): Clerk sin interfaz en las páginas
            públicas y completo en la cuenta. */}
        {children}
      </body>
    </html>
  );
}
