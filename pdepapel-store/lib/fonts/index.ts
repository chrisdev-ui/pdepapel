import { Caudex, Coming_Soon, Martel_Sans, Roboto } from "next/font/google";

export const caudex = Caudex({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  style: ["italic", "normal"],
  variable: "--font-caudex",
});
export const comingSoon = Coming_Soon({
  subsets: ["latin"],
  display: "swap",
  weight: "400",
  style: "normal",
  variable: "--font-coming-soon",
});
export const martelSans = Martel_Sans({
  subsets: ["latin"],
  display: "swap",
  weight: ["200", "300", "400", "600", "700", "800", "900"],
  style: "normal",
  variable: "--font-martel-sans",
});
export const roboto = Roboto({
  style: ["normal", "italic"],
  weight: ["100", "300", "400", "500", "700", "900"],
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-roboto",
});
