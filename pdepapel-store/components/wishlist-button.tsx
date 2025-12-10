"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Icons } from "@/components/icons";
import { useWishlist } from "@/hooks/use-wishlist";

export const WishlistButton: React.FC<{}> = () => {
  const { items } = useWishlist();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return null;
  }
  return (
    <Link
      href="/wishlist"
      className="relative hover:opacity-75"
      aria-label="Ver lista de deseos"
    >
      <Icons.heart className="h-6 w-6" isFilled={items.length > 0} />
      {items.length > 0 && (
        <span className="absolute -right-3 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-yankees font-serif text-xxs text-white">
          {items.length}
        </span>
      )}
    </Link>
  );
};
