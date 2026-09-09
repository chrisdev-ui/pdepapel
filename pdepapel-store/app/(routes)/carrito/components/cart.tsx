"use client";

import { ArrowLeft, Heart, ShoppingBag } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

import { getProducts } from "@/actions/get-products";
import { ProductList } from "@/components/product-list";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCart } from "@/hooks/use-cart";
import { useWishlist } from "@/hooks/use-wishlist";
import { stripTaxonomyIcon } from "@/lib/catalog-labels";
import { getAnalyticsValue, toAnalyticsItem, trackCustomerEvent } from "@/lib/customer-analytics";
import { categoryPath, STOREFRONT_ROUTES } from "@/lib/routes";
import { calculateTotals, cn, currencyFormatter } from "@/lib/utils";
import { useStorefrontSettings } from "@/providers/storefront-settings-provider";
import { Category, Product } from "@/types";

import { CartItem, PriceChange } from "./cart-item";
import { SavedForLater } from "./saved-for-later";
import { Summary } from "./summary";

interface CartProps {
  /** Más vendidos para completar el pedido; se filtran los que ya están en el carrito. */
  suggestions?: Product[];
  /** Categorías destacadas para el carrito vacío. */
  categories?: Category[];
}

const CHIP_TINTS = ["bg-kawaii-lavender-light", "bg-kawaii-pink-light", "bg-kawaii-mint-light", "bg-kawaii-yellow-light"];
const MAX_SUGGESTIONS = 4;

const Cart: React.FC<CartProps> = ({ suggestions = [], categories = [] }) => {
  const cart = useCart();
  const wishlistCount = useWishlist((state) => state.items.length);
  const { freeShippingThreshold } = useStorefrontSettings();
  const [isMounted, setIsMounted] = useState(false);
  const [priceChanges, setPriceChanges] = useState<Record<string, PriceChange>>({});
  const headingRef = useRef<HTMLHeadingElement>(null);
  const syncedIdsRef = useRef<string>("");

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isMounted || cart.items.length === 0) return;
    const items = cart.items.map((item) => toAnalyticsItem(item, item.quantity ?? 1));
    trackCustomerEvent("view_cart", { cart_surface: "page", currency: "COP", items, value: getAnalyticsValue(items) });
    // Solo al entrar a la página, no en cada edición.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted]);

  // Stock y precio se refrescan con el catálogo actual; si un precio cambió
  // desde que se agregó, la línea lo dice.
  useEffect(() => {
    if (!isMounted || cart.items.length === 0) return;
    const ids = cart.items.map((item) => item.id).sort().join(",");
    if (syncedIdsRef.current === ids) return;
    syncedIdsRef.current = ids;
    const previous = new Map(cart.items.map((item) => [item.id, Number(item.price)]));

    getProducts({ ids })
      .then(({ products }) => {
        const changes: Record<string, PriceChange> = {};
        products.forEach((product) => {
          const before = previous.get(product.id);
          if (before !== undefined && before !== Number(product.price)) changes[product.id] = { from: before, to: Number(product.price) };
          cart.syncProduct(product);
        });
        if (Object.keys(changes).length > 0) setPriceChanges((current) => ({ ...current, ...changes }));
      })
      .catch((error) => console.error("No se pudo actualizar el carrito", error));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isMounted, cart.items.length]);

  const count = cart.items.reduce((total, item) => total + Number(item.quantity ?? 1), 0);
  const checkoutBlocker = cart.items.find((item) => item.stock === 0 || (item.quantity ?? 0) > item.stock);
  const { freeShippingRemaining } = useMemo(() => calculateTotals(cart.items, null, 0, freeShippingThreshold), [cart.items, freeShippingThreshold]);
  const cartIds = new Set(cart.items.map((item) => item.id));
  const visibleSuggestions = suggestions.filter((product) => !cartIds.has(product.id)).slice(0, MAX_SUGGESTIONS);

  const onRemove = (id: string) => {
    cart.removeItem(id);
    headingRef.current?.focus();
  };

  if (!isMounted) return <CartSkeleton />;

  const isEmpty = cart.items.length === 0;

  return (
    <div className="flex flex-col gap-8 lg:gap-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 ref={headingRef} tabIndex={-1} className="font-serif text-3xl font-bold text-blue-yankees outline-none sm:text-[34px]">
          Mi carrito{" "}
          {!isEmpty && (
            <span className="font-quicksand text-lg font-semibold text-gray-500">
              · {count} {count === 1 ? "producto" : "productos"}
            </span>
          )}
        </h1>
        {!isEmpty && (
          <Link href={STOREFRONT_ROUTES.shop} className="inline-flex items-center gap-1.5 font-sans text-sm font-semibold text-blue-yankees underline underline-offset-4">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Seguir comprando
          </Link>
        )}
      </div>

      {isEmpty ? (
        <EmptyCart categories={categories} wishlistCount={wishlistCount} threshold={freeShippingThreshold} />
      ) : (
        <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start lg:gap-12">
          <div className="flex flex-col gap-8">
            <ul aria-label="Productos en el carrito" className="flex flex-col">
              {cart.items.map((item) => (
                <CartItem key={item.id} item={item} priceChange={priceChanges[item.id]} onRemove={onRemove} />
              ))}
            </ul>
            <SavedForLater />
          </div>
          <Summary disabledReason={checkoutBlocker ? `Revisa «${checkoutBlocker.name}»: ${checkoutBlocker.stock === 0 ? "está agotado" : `solo quedan ${checkoutBlocker.stock}`}.` : null} />
        </div>
      )}

      {visibleSuggestions.length > 0 && (
        <ProductList
          title="Completa tu pedido"
          eyebrow={!isEmpty && freeShippingRemaining > 0 ? `Te faltan ${currencyFormatter.format(freeShippingRemaining)} para el envío gratis` : "Lo más pedido"}
          products={visibleSuggestions}
          action={{ label: "Ver toda la tienda", href: STOREFRONT_ROUTES.shop }}
        />
      )}
    </div>
  );
};

function EmptyCart({ categories, wishlistCount, threshold }: { categories: Category[]; wishlistCount: number; threshold: number | null }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-pink-shell bg-kawaii-pink-light/25 px-6 py-10 text-center">
      <span className="flex h-16 w-16 items-center justify-center rounded-full bg-white">
        <ShoppingBag aria-hidden="true" className="h-7 w-7 text-blue-yankees" />
      </span>
      <h2 className="font-serif text-2xl font-bold text-blue-yankees">Tu carrito está vacío</h2>
      <p className="max-w-md font-sans text-sm text-gray-600">
        Guarda lo que te gusta en favoritos o empieza por lo más pedido.
        {threshold ? ` Envío gratis desde ${currencyFormatter.format(threshold)}.` : ""}
      </p>
      {categories.length > 0 && (
        <ul className="flex flex-wrap justify-center gap-2" aria-label="Categorías destacadas">
          {categories.map((category, index) => (
            <li key={category.id}>
              <Link
                href={categoryPath(category.slug as string)}
                className={cn("inline-flex h-9 items-center rounded-full px-3.5 font-sans text-[13px] font-bold text-blue-yankees", CHIP_TINTS[index % CHIP_TINTS.length])}
              >
                {stripTaxonomyIcon(category.name)}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap justify-center gap-2.5">
        <Button asChild className="h-11 rounded-full bg-blue-yankees px-5 font-sans font-semibold">
          <Link href={STOREFRONT_ROUTES.shop}>Ir a la tienda</Link>
        </Button>
        {wishlistCount > 0 && (
          <Button asChild variant="outline" className="h-11 rounded-full border-2 border-blue-yankees px-5 font-sans font-semibold text-blue-yankees">
            <Link href={STOREFRONT_ROUTES.wishlist}>
              <Heart aria-hidden="true" className="mr-2 h-4 w-4" />
              Ver mis favoritos ({wishlistCount})
            </Link>
          </Button>
        )}
      </div>
    </div>
  );
}

const CartSkeleton = () => (
  <div className="space-y-8" aria-busy="true" aria-live="polite">
    <span className="sr-only">Cargando carrito</span>
    <Skeleton className="h-10 w-52" />
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-12">
      <div className="space-y-4">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="flex gap-4 border-b py-5">
            <Skeleton className="h-24 w-24 shrink-0 rounded-xl" />
            <div className="flex-1 space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-11 w-28" />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-8 space-y-4 rounded-2xl bg-blue-baby/20 p-6 lg:mt-0">
        <Skeleton className="h-7 w-36" />
        <Skeleton className="h-5 w-full" />
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  </div>
);

export default Cart;
