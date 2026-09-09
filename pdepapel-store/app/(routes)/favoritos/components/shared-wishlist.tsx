"use client";

import { Heart } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import ProductCard from "@/components/ui/product-card";
import { toast } from "@/hooks/use-toast";
import { useWishlist } from "@/hooks/use-wishlist";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { Product } from "@/types";

interface SharedWishlistProps {
  products: Product[];
}

/** Lista que alguien compartió por enlace: se puede mirar y guardar en los favoritos propios. */
export function SharedWishlist({ products }: SharedWishlistProps) {
  const items = useWishlist((state) => state.items);
  const addMany = useWishlist((state) => state.addMany);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const ownIds = new Set(items.map((item) => item.id));
  const missing = products.filter((product) => !ownIds.has(product.id));

  const saveAll = () => {
    const added = addMany(missing);
    toast({ description: added > 0 ? `${added} ${added === 1 ? "producto guardado" : "productos guardados"} en tus favoritos.` : "Ya tenías todos estos productos en favoritos.", variant: "success" });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-sans text-[11px] font-bold uppercase tracking-[0.08em] text-gray-500">Lista compartida</p>
          <h1 className="font-serif text-3xl font-bold text-blue-yankees sm:text-[34px]">
            Favoritos que te compartieron{" "}
            <span className="font-quicksand text-lg font-semibold text-gray-500">
              · {products.length} {products.length === 1 ? "producto" : "productos"}
            </span>
          </h1>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {isMounted && products.length > 0 && (
            <Button onClick={saveAll} disabled={missing.length === 0} className="h-11 rounded-full bg-blue-yankees px-5 font-sans text-sm font-semibold">
              <Heart aria-hidden="true" className="mr-2 h-4 w-4" />
              {missing.length === 0 ? "Ya están en tus favoritos" : `Guardar ${missing.length === products.length ? "todos" : `los ${missing.length} que faltan`} en mis favoritos`}
            </Button>
          )}
          <Button asChild variant="outline" className="h-11 rounded-full border-2 border-blue-yankees px-5 font-sans text-sm font-semibold text-blue-yankees">
            <Link href={STOREFRONT_ROUTES.wishlist}>Ver mis favoritos</Link>
          </Button>
        </div>
      </div>
      {products.length === 0 ? (
        <p className="rounded-2xl border-2 border-dashed border-blue-purple px-6 py-10 text-center font-sans text-sm text-gray-600">Esta lista ya no tiene productos disponibles.</p>
      ) : (
        <ul aria-label="Productos de la lista compartida" className="grid grid-cols-2 gap-2.5 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
          {products.map((product) => (
            <li key={product.id}>
              <ProductCard product={product} sizes="(max-width: 640px) 50vw, (max-width: 1280px) 33vw, 25vw" />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
