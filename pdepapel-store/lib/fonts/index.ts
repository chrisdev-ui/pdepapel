import { Caudex, Fredoka, Quicksand } from "next/font/google";
import localFont from "next/font/local";

export const caudex = Caudex({
  subsets: ["latin"],
  weight: ["400", "700"],
  display: "swap",
  style: ["italic", "normal"],
  variable: "--font-caudex",
});
export const beautifulEveryTime = localFont({
  src: "../../public/fonts/BeautifulEveryTime-Dg4m.woff2",
  variable: "--font-beautiful-every-time-regular",
  display: "swap",
  preload: false,
});
export const fredoka = Fredoka({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-fredoka",
});
export const quicksand = Quicksand({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
  display: "swap",
  variable: "--font-quicksand",
  preload: false,
});
