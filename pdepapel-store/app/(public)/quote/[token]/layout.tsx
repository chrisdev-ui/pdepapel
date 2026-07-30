import { Metadata } from "next";

export const metadata: Metadata = {
  robots: {
    index: false,
    follow: false,
  },
};

export default function QuoteLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return children;
}
