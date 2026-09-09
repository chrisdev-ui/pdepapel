import { Metadata } from "next";

import { getCategories } from "@/actions/get-categories";
import { getProducts } from "@/actions/get-products";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Container } from "@/components/ui/container";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { decodeSharedList, SHARED_LIST_PARAM } from "@/lib/shared-wishlist";

import { SharedWishlist } from "./components/shared-wishlist";
import { Wishlist } from "./components/wishlist";

export const metadata: Metadata = {
  title: "Mis favoritos",
  description:
    "Tus productos favoritos de Papelería P de Papel: revisa precio y disponibilidad y pásalos al carrito cuando quieras.",
  alternates: { canonical: STOREFRONT_ROUTES.wishlist },
  robots: { index: false, follow: false },
};

export const revalidate = 300;

interface WishlistPageProps {
  searchParams: Record<string, string | string[] | undefined>;
}

export default async function WishlistPage({
  searchParams,
}: WishlistPageProps) {
  const sharedIds = decodeSharedList(searchParams[SHARED_LIST_PARAM]);
  if (sharedIds.length > 0) {
    const { products } = await getProducts({ ids: sharedIds.join(",") });
    return (
      <Container className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Breadcrumb
          items={[
            { label: "Favoritos", href: STOREFRONT_ROUTES.wishlist },
            { label: "Lista compartida", isCurrent: true },
          ]}
          className="mb-5"
        />
        <SharedWishlist products={products} />
      </Container>
    );
  }

  const [suggestions, categories] = await Promise.all([
    getProducts({
      fromShop: true,
      groupBy: "parents",
      sortOption: "bestSellers",
      page: 1,
      itemsPerPage: 8,
    }),
    getCategories(),
  ]);
  const featured = categories
    .filter(
      (category) =>
        category.seoEnabled && category.seoFeatured && category.slug,
    )
    .slice(0, 4);

  return (
    <Container className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Breadcrumb
        items={[{ label: "Favoritos", isCurrent: true }]}
        className="mb-5"
      />
      <Wishlist suggestions={suggestions.products} categories={featured} />
    </Container>
  );
}
