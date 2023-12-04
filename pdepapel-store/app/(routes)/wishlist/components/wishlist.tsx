"use client";

import { Star } from "lucide-react";
import { useEffect, useState } from "react";

import { Newsletter } from "@/components/newsletter";
import { Container } from "@/components/ui/container";
import { DataTable } from "@/components/ui/data-table";
import { KAWAII_FACE_HAPPY, KAWAII_FACE_SAD } from "@/constants";
import { useWishlist } from "@/hooks/use-wishlist";
import { WishlistColumn, columns } from "./columns";

export function Wishlist() {
  const { items } = useWishlist();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }

  const formattedItems: WishlistColumn[] = items?.map((item) => ({
    id: item.id,
    imageUrl: item.images[0].url,
    name: item.name,
    price: item.price,
    stock: item.stock,
    createdAt: item.addedOn,
  }));

  return (
    <>
      <Container>
        <h1 className="flex items-center justify-start font-serif text-3xl font-bold">
          Mi Lista de Deseos
          <Star className="ml-2 h-8 w-8" />
        </h1>
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
