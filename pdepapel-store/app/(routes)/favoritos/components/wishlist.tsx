"use client";

import { SignedOut } from "@clerk/nextjs";
import { Star } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useState } from "react";

import { Container } from "@/components/ui/container";
import { DataTable } from "@/components/ui/data-table";
import { Skeleton } from "@/components/ui/skeleton";
import { KAWAII_FACE_HAPPY, KAWAII_FACE_SAD } from "@/constants";
import { useWishlist } from "@/hooks/use-wishlist";
import { accountAccessPath, STOREFRONT_ROUTES } from "@/lib/routes";
import { WishlistColumn, columns } from "./columns";

const Newsletter = dynamic(() => import("@/components/newsletter"), {
  ssr: false,
});

export function Wishlist() {
  const { items } = useWishlist();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return <WishlistSkeleton />;
  }

  const formattedItems: WishlistColumn[] = items?.map((item) => ({
    id: item.id,
    slug: item.slug,
    imageUrl:
      item.images.find((image) => image.isMain)?.url ?? item.images[0]?.url,
    name: item.name,
    price: item.price,

    originalPrice: item.originalPrice,
    hasDiscount: item.hasDiscount,
    offerLabel: item.offerLabel,
    stock: item.stock,
    createdAt: item.addedOn,
    color: item.color?.name,
    design: item.design?.name,
  }));

  return (
    <>
      <Container>
        <h1 className="flex items-center justify-start font-serif text-3xl font-bold">
          Mi Lista de Deseos
          <Star className="ml-2 h-8 w-8" />
        </h1>
        <SignedOut>
          <aside className="mt-6 rounded-xl border border-purple-100 bg-gradient-to-r from-purple-50 to-pink-50 p-4 text-sm text-muted-foreground">
            <p className="font-semibold text-foreground">
              Guarda tus favoritos en todos tus dispositivos
            </p>
            <p className="mt-1">
              Crea una cuenta o inicia sesión para conservar esta lista cuando
              cambies de celular o computador.
            </p>
            <Link
              href={accountAccessPath(
                STOREFRONT_ROUTES.signUp,
                STOREFRONT_ROUTES.wishlist,
              )}
              className="mt-3 inline-block font-semibold text-purple-700 underline underline-offset-4"
            >
              Crear cuenta gratis
            </Link>
          </aside>
        </SignedOut>
        <div className="my-16 w-full">
          {items?.length === 0 && (
            <p className="text-center text-neutral-500">
              No tienes productos en tu lista de deseos {KAWAII_FACE_SAD}
            </p>
          )}
          {items?.length > 0 && (
            <DataTable
              caption={`Tu lista de productos favoritos ${KAWAII_FACE_HAPPY}`}
              columns={columns}
              data={formattedItems}
            />
          )}
        </div>
      </Container>
      {items?.length === 0 && <Newsletter />}
    </>
  );
}

function WishlistSkeleton() {
  return (
    <Container className="space-y-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Cargando lista de deseos</span>
      <Skeleton className="h-10 w-72" />
      <div className="space-y-4 rounded-xl border p-4">
        {Array.from({ length: 3 }, (_, index) => (
          <div
            key={index}
            className="flex items-center gap-4 border-b py-3 last:border-0"
          >
            <Skeleton className="h-16 w-16 shrink-0" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-5 w-2/3" />
              <Skeleton className="h-4 w-1/3" />
            </div>
            <Skeleton className="h-9 w-24" />
          </div>
        ))}
      </div>
    </Container>
  );
}
