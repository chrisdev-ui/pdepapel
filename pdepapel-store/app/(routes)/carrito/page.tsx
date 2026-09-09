import { Metadata } from "next";

import { getCategories } from "@/actions/get-categories";
import { getProducts } from "@/actions/get-products";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Container } from "@/components/ui/container";
import { STOREFRONT_ROUTES } from "@/lib/routes";

import Cart from "./components/cart";

export const metadata: Metadata = {
  title: "Tu carrito de compras",
  description: "Revisa y ajusta tu carrito en Papelería P de Papel antes de finalizar la compra.",
  alternates: { canonical: STOREFRONT_ROUTES.cart },
  robots: { index: false, follow: false },
};

export const revalidate = 300;

const SUGGESTIONS = 4;
const CATEGORY_CHIPS = 4;

export default async function CartPage() {
  const [suggestions, categories] = await Promise.all([
    getProducts({ fromShop: true, groupBy: "parents", sortOption: "bestSellers", page: 1, itemsPerPage: SUGGESTIONS * 2 }),
    getCategories(),
  ]);
  const featuredCategories = categories
    .filter((category) => category.seoEnabled && category.seoFeatured && category.slug)
    .slice(0, CATEGORY_CHIPS);

  return (
    <Container className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Breadcrumb items={[{ label: "Tienda", href: STOREFRONT_ROUTES.shop }, { label: "Carrito", isCurrent: true }]} className="mb-5" />
      <Cart suggestions={suggestions.products} categories={featuredCategories} />
    </Container>
  );
}
