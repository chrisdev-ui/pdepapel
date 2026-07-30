import { OrderHistory } from "@/components/order-history";
import { Metadata } from "next";
import { STOREFRONT_ROUTES } from "@/lib/routes";

export const metadata: Metadata = {
  alternates: {
    canonical: STOREFRONT_ROUTES.myOrders,
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function MyOrders() {
  return <OrderHistory />;
}
