import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { ModalProvider } from "@/providers/moda-provider";
import { Toaster } from "@/providers/toaster";
import { esES } from "@clerk/localizations";
import { ClerkProvider } from "@clerk/nextjs";
import type { Metadata } from "next";
import { Caudex, Coming_Soon, Martel_Sans, Roboto } from "next/font/google";
import "./globals.css";

const caudex = Caudex({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  style: ["italic", "normal"],
  variable: "--font-caudex",
});
const comingSoon = Coming_Soon({
  subsets: ["latin"],
  display: "swap",
  weight: "400",
  style: "normal",
  variable: "--font-coming-soon",
});
const martelSans = Martel_Sans({
  subsets: ["latin"],
  display: "swap",
  weight: ["200", "300", "400", "600", "700", "800", "900"],
  style: "normal",
  variable: "--font-martel-sans",
});

const roboto = Roboto({
  style: ["normal", "italic"],
  weight: ["100", "300", "400", "500", "700", "900"],
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-roboto",
});

export const metadata: Metadata = {
  title: {
    default: "Papelería P de Papel",
    template: "%s",
  },
  description: "Sitio web para papelería p de papel creado con NextJS 13.5",
  applicationName: "PdePapel",
  keywords: [
    "Papelería",
    "Papelería P de Papel",
    "Stationery",
    "Kawaii",
    "papelería kawaii",
    "papelería bonita",
    "P de papel",
  ],
  authors: [
    { name: "Christian Torres", url: "https://github.com/chrisdev-ui" },
  ],
  creator: "Paula Morales & Christian Torres",
  icons: {
    icon: "/favicon.ico",
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
