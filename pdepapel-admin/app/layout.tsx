import { ModalProvider } from "@/providers/modal-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { Toaster } from "@/providers/toaster";
import { esES } from "@clerk/localizations";
import { ClerkProvider } from "@clerk/nextjs";
import { adminClerkAppearance } from "@/lib/clerk-appearance";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import NextTopLoader from "nextjs-toploader";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PdePapel Admin Dashboard",
  description: "Admin Dashboard for PdePapel",
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ClerkProvider
      localization={esES}
      signInUrl="/iniciar-sesion"
      signInFallbackRedirectUrl="/"
      appearance={adminClerkAppearance}
    >
      <html lang="es" suppressHydrationWarning>
        <body className={inter.className}>
          <NextTopLoader
            color="#0f172a"
            showSpinner
            easing="ease"
            zIndex={1600}
            height={3}
          />
          <ThemeProvider attribute="class" defaultTheme="light" forcedTheme="light" enableSystem={false}>
            <Toaster />
            <ModalProvider />
            {children}
          </ThemeProvider>
        </body>
      </html>
    </ClerkProvider>
  );
}
