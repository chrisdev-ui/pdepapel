"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Icons } from "@/components/icons";
import { useWishlist } from "@/hooks/use-wishlist";
import { STOREFRONT_ROUTES } from "@/lib/routes";
import { cn } from "@/lib/utils";

export const WishlistButton: React.FC<{
  /** Show the "Favoritos" word next to the heart (desktop header). */
  withLabel?: boolean;
  className?: string;
}> = ({ withLabel = false, className }) => {
  const { items } = useWishlist();
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const totalItems = isMounted ? items.length : 0;

  return (
    <Link
      href={STOREFRONT_ROUTES.wishlist}
      className={cn(
        "relative flex items-center gap-2 font-sans font-semibold text-blue-yankees hover:opacity-75",
        className,
      )}
      aria-label="Ver lista de deseos"
    >
      <Icons.heart className="h-6 w-6" isFilled={totalItems > 0} />
      {withLabel ? <span className="hidden xl:inline">Favoritos</span> : null}
      {totalItems > 0 && (
        <span className="absolute -right-3 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-blue-yankees font-sans text-xxs text-white">
          {totalItems}
        </span>
      )}
    </Link>
  );
};
