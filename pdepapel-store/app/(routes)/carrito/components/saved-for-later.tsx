"use client";

import { Heart } from "lucide-react";
import Link from "next/link";

import { CloudinaryImage } from "@/components/ui/cloudinary-image";
import { useCart } from "@/hooks/use-cart";
import { useWishlist } from "@/hooks/use-wishlist";
import { productPath, STOREFRONT_ROUTES } from "@/lib/routes";
import { currencyFormatter } from "@/lib/utils";

const MAX_VISIBLE = 4;

/** Favoritos vistos desde el carrito: lo que la clienta apartó para después. */
export function SavedForLater() {
  const cartIds = useCart((state) => state.items.map((item) => item.id));
  const items = useWishlist((state) => state.items).filter((item) => !cartIds.includes(item.id));
  const moveToCart = useWishlist((state) => state.moveToCart);

  if (items.length === 0) return null;
  const visible = items.slice(0, MAX_VISIBLE);

  return (
    <section aria-labelledby="guardados-titulo" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h2 id="guardados-titulo" className="font-sans text-base font-bold text-blue-yankees">
          Guardados para después <span className="font-medium text-gray-500">· {items.length}</span>
        </h2>
        {items.length > MAX_VISIBLE && (
          <Link href={STOREFRONT_ROUTES.wishlist} className="font-sans text-sm font-semibold text-blue-yankees underline underline-offset-4">
            Ver todos
          </Link>
        )}
      </div>
      <ul className="flex flex-col gap-2">
        {visible.map((item) => {
          const image = item.images?.find((entry) => entry.isMain) ?? item.images?.[0];
          const available = item.stock > 0;
          return (
            <li key={item.id} className="flex items-center gap-3.5 rounded-xl border border-dashed border-blue-baby p-3">
              <Link href={productPath(item.slug || item.id)} className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-gray-100" aria-label={`Ver ${item.name}`}>
                {image?.url ? <CloudinaryImage src={image.url} alt="" width={56} height={56} className="h-full w-full object-cover" /> : <Heart aria-hidden="true" className="m-auto h-5 w-5 text-gray-400" />}
              </Link>
              <div className="min-w-0 flex-1">
                <p className="truncate font-sans text-sm font-semibold text-blue-yankees">{item.name}</p>
                <p className="font-sans text-xs text-gray-500">
                  <span className="font-quicksand font-bold text-blue-yankees">{currencyFormatter.format(Number(item.price))}</span>
                  {!available && <span className="ml-2 font-semibold text-red-700">agotado</span>}
                  {available && item.stock <= 3 && <span className="ml-2 font-semibold text-orange-900">quedan {item.stock}</span>}
                </p>
              </div>
              <button
                type="button"
                onClick={() => moveToCart(item.id)}
                disabled={!available}
                className="inline-flex h-10 shrink-0 items-center rounded-full border-2 border-border bg-white px-3.5 font-sans text-[13px] font-semibold text-blue-yankees transition-colors hover:border-blue-yankees disabled:cursor-not-allowed disabled:opacity-50"
              >
                Mover al carrito
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
