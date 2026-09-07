"use client";

import Link from "next/link";

import { stripTaxonomyIcon } from "@/lib/catalog-labels";
import { trackCustomerEvent } from "@/lib/customer-analytics";
import { STOREFRONT_ROUTES, typePath } from "@/lib/routes";
import { TypeIcon } from "@/lib/type-icons";
import { cn } from "@/lib/utils";
import { Type } from "@/types";

const CHIP_TINTS = [
  "bg-kawaii-lavender-light",
  "bg-kawaii-pink-light/60",
  "bg-kawaii-mint-light",
  "bg-kawaii-yellow-light",
  "bg-kawaii-blue-light",
];

interface CategoryChipsProps {
  types: Type[];
  limit?: number;
  className?: string;
}

/**
 * One-tap shortcuts to the main catalog types, shown under the header on
 * phones and tablets. Desktop has the category row instead.
 */
export function CategoryChips({
  types,
  limit = 5,
  className,
}: CategoryChipsProps) {
  const visible = types.slice(0, limit);
  if (visible.length === 0) return null;

  return (
    <nav
      aria-label="Atajos de categorías"
      className={cn(
        "category-chips flex gap-2 overflow-x-auto px-3 py-2.5 sm:px-6 lg:hidden",
        className,
      )}
    >
      {visible.map((type, index) => {
        const label = stripTaxonomyIcon(type.name);
        return (
          <Link
            key={type.id}
            href={typePath(type)}
            onClick={() =>
              trackCustomerEvent("select_content", {
                content_type: "category_chip",
                item_id: type.slug || type.id,
                item_category: label,
              })
            }
            className={cn(
              "flex h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-4 font-sans text-sm font-medium text-blue-yankees transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2",
              CHIP_TINTS[index % CHIP_TINTS.length],
            )}
          >
            <TypeIcon type={type} className="h-4 w-4" />
            {label}
          </Link>
        );
      })}
      <Link
        href={STOREFRONT_ROUTES.shop}
        className="flex h-11 shrink-0 items-center whitespace-nowrap rounded-full border-[1.5px] border-blue-yankees px-4 font-sans text-sm font-medium text-blue-yankees transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2"
      >
        Todas
      </Link>
    </nav>
  );
}
