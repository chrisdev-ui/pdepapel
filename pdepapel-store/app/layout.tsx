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
