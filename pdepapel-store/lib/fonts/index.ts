import { Caudex, Nunito, Roboto } from "next/font/google";
import localFont from "next/font/local";

export const caudex = Caudex({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  style: ["italic", "normal"],
  variable: "--font-caudex",
});
export const mangabeyregular = localFont({
  src: "../../public/fonts/MangabeyRegular.otf",
  variable: "--font-mangabey-regular",
});
export const nunito = Nunito({
  subsets: ["latin"],
  display: "swap",
  weight: ["200", "300", "400", "500", "600", "700", "800", "900", "1000"],
  style: "normal",
  variable: "--font-nunito",
});
export const roboto = Roboto({
  style: ["normal", "italic"],
  weight: ["100", "300", "400", "500", "700", "900"],
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-roboto",
});
