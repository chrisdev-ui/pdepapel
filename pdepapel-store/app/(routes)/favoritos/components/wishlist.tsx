"use client";

import { SignedOut } from "@clerk/nextjs";
import { Heart, ShoppingCart, UserPlus } from "lucide-react";

import { ShareButton } from "@/components/share-button";
import { encodeSharedList, SHARED_LIST_PARAM } from "@/lib/shared-wishlist";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { getProducts } from "@/actions/get-products";
import { ProductList } from "@/components/product-list";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useWishlist } from "@/hooks/use-wishlist";
import { stripTaxonomyIcon } from "@/lib/catalog-labels";
import { getProductAvailability } from "@/lib/product-availability";
import {
  accountAccessPath,
  categoryPath,
  STOREFRONT_ROUTES,
} from "@/lib/routes";
import { cn, currencyFormatter } from "@/lib/utils";
import { Category, Product } from "@/types";

import { FavoriteCard } from "./favorite-card";

interface WishlistProps {
  suggestions?: Product[];
  categories?: Category[];
}

const CHIP_TINTS = [
  "bg-kawaii-yellow-light",
  "bg-kawaii-pink-light",
  "bg-kawaii-peach",
  "bg-kawaii-mint-light",
];

export function Wishlist({ suggestions = [], categories = [] }: WishlistProps) {
  const items = useWishlist((state) => state.items);
  const isHydrated = useWishlist((state) => state.isHydrated);
  const addToCart = useWishlist((state) => state.addToCart);
  const removeItem = useWishlist((state) => state.removeItem);
  const refreshItems = useWishlist((state) => state.refreshItems);
  const [isMounted, setIsMounted] = useState(false);
  const [previousPrices, setPreviousPrices] = useState<Record<string, number>>(
    {},
  );
  const headingRef = useRef<HTMLHeadingElement>(null);
  const refreshedRef = useRef("");

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Precio y stock al día: lo guardado en el navegador puede tener meses.
  useEffect(() => {
    if (!isMounted || !isHydrated || items.length === 0) return;
    const ids = items
      .map((item) => item.id)
      .sort()
      .join(",");
    if (refreshedRef.current === ids) return;
    refreshedRef.current = ids;
    const stored = Object.fromEntries(
      items.map((item) => [item.id, Number(item.price)]),
    );
    getProducts({ ids })
      .then(({ products }) => {
        setPreviousPrices((current) => ({ ...current, ...stored }));
        refreshItems(products);
      })
      .catch((error) =>
        console.error("No se pudieron actualizar los favoritos", error),
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted, isHydrated, items.length]);

  if (!isMounted) return <WishlistSkeleton />;

  const available = items.filter(
    (item) => getProductAvailability(item).canBuy && !item.isGroup,
  );
  const availableTotal = available.reduce(
    (sum, item) => sum + Number(item.price),
    0,
  );
  const soldOut = items.filter((item) => item.stock <= 0).length;
  const dropped = items.filter(
    (item) =>
      previousPrices[item.id] !== undefined &&
      previousPrices[item.id] > Number(item.price),
  ).length;
  const summary = [
    available.length
      ? `${available.length} ${available.length === 1 ? "disponible" : "disponibles"} ahora`
      : null,
    dropped
      ? `${dropped} ${dropped === 1 ? "bajó" : "bajaron"} de precio`
      : null,
    soldOut ? `${soldOut} ${soldOut === 1 ? "agotado" : "agotados"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const favoriteIds = new Set(items.map((item) => item.id));
  const recommendations = suggestions
    .filter((product) => !favoriteIds.has(product.id))
    .slice(0, 4);

  const onRemove = (id: string) => {
    removeItem(id);
    headingRef.current?.focus();
  };
  const addAllAvailable = () => available.forEach((item) => addToCart(item.id));

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="font-serif text-3xl font-bold text-blue-yankees outline-none sm:text-[34px]"
          >
            Mis favoritos{" "}
            {items.length > 0 && (
              <span className="font-quicksand text-lg font-semibold text-gray-500">
                · {items.length} {items.length === 1 ? "producto" : "productos"}
              </span>
            )}
          </h1>
          {summary && (
            <p className="mt-1 font-sans text-sm text-gray-500">{summary}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {items.length > 0 && (
            <ShareButton
              title="Mis favoritos en P de Papel"
              path={`${STOREFRONT_ROUTES.wishlist}?${SHARED_LIST_PARAM}=${encodeSharedList(items.map((item) => item.id))}`}
              className="h-11 rounded-full border-2 border-border bg-white px-4 text-blue-yankees"
            />
          )}
          {available.length > 1 && (
            <Button
              onClick={addAllAvailable}
              className="h-11 rounded-full bg-blue-yankees px-5 font-sans text-sm font-semibold"
            >
              <ShoppingCart aria-hidden="true" className="mr-2 h-4 w-4" />
              Agregar los {available.length} disponibles ·{" "}
              {currencyFormatter.format(availableTotal)}
            </Button>
          )}
        </div>
      </div>

      <SignedOut>
        <aside className="flex flex-col items-start gap-3 rounded-xl border border-purple-100 bg-gradient-to-r from-purple-50 to-pink-50 px-4 py-3 font-sans text-sm text-blue-yankees sm:flex-row sm:items-center">
          <UserPlus
            aria-hidden="true"
            className="h-5 w-5 shrink-0 text-purple-700"
          />
          <p className="min-w-0 flex-1">
            <strong>Guarda tus favoritos en tu cuenta</strong> para verlos en
            cualquier dispositivo y no perderlos si cambias de celular.
          </p>
          <Link
            href={accountAccessPath(
              STOREFRONT_ROUTES.signUp,
              STOREFRONT_ROUTES.wishlist,
            )}
            className="inline-flex h-10 items-center rounded-full border-2 border-blue-yankees px-4 font-semibold"
          >
            Crear cuenta gratis
          </Link>
        </aside>
      </SignedOut>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-blue-purple bg-kawaii-lavender-light/40 px-6 py-10 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white">
            <Heart aria-hidden="true" className="h-7 w-7 text-rose-700" />
          </span>
          <h2 className="font-serif text-2xl font-bold text-blue-yankees">
            Todavía no tienes favoritos
          </h2>
          <p className="max-w-md font-sans text-sm text-gray-600">
            Toca el corazón en cualquier producto para guardarlo aquí. Te
            mostramos si baja de precio o si se está agotando.
          </p>
          {categories.length > 0 && (
            <ul
              className="flex flex-wrap justify-center gap-2"
              aria-label="Categorías destacadas"
            >
              {categories.map((category, index) => (
                <li key={category.id}>
                  <Link
                    href={categoryPath(category.slug as string)}
                    className={cn(
                      "inline-flex h-9 items-center rounded-full px-3.5 font-sans text-[13px] font-bold text-blue-yankees",
                      CHIP_TINTS[index % CHIP_TINTS.length],
                    )}
                  >
                    {stripTaxonomyIcon(category.name)}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <Button
            asChild
            className="h-11 rounded-full bg-blue-yankees px-5 font-sans font-semibold"
          >
            <Link href={STOREFRONT_ROUTES.shop}>Explorar la tienda</Link>
          </Button>
        </div>
      ) : (
        <ul
          aria-label="Productos favoritos"
          className="grid grid-cols-2 gap-x-2.5 gap-y-6 sm:gap-x-4 md:grid-cols-3 xl:grid-cols-4"
        >
          {items.map((item) => (
            <li key={item.id}>
              <FavoriteCard
                item={item}
                previousPrice={previousPrices[item.id]}
                onAddToCart={addToCart}
                onRemove={onRemove}
              />
            </li>
          ))}
        </ul>
      )}

      {recommendations.length > 0 && (
        <ProductList
          title="También te pueden gustar"
          eyebrow={items.length > 0 ? "Según tus favoritos" : "Lo más pedido"}
          products={recommendations}
          action={{ label: "Ver toda la tienda", href: STOREFRONT_ROUTES.shop }}
        />
      )}
    </div>
  );
}

function WishlistSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando favoritos</span>
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="space-y-3">
            <Skeleton className="aspect-square w-full rounded-xl" />
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-11 w-full rounded-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
