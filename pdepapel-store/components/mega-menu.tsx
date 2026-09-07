"use client";

import { ArrowRight, ChevronDown, ChevronRight, Menu } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { Currency } from "@/components/ui/currency";
import { stripTaxonomyIcon } from "@/lib/catalog-labels";
import { FeaturedByType, NavigationType } from "@/lib/catalog-navigation";
import { trackCustomerEvent } from "@/lib/customer-analytics";
import { categoryPath, productPath, typePath } from "@/lib/routes";
import { TypeIcon } from "@/lib/type-icons";
import { cn } from "@/lib/utils";

interface MegaMenuProps {
  types: NavigationType[];
  featuredByType: FeaturedByType;
}

/**
 * Desktop "Todas las categorías" panel: hover or focus a type on the left,
 * its subcategories and a featured product appear on the right.
 */
export function MegaMenu({ types, featuredByType }: MegaMenuProps) {
  const pathname = usePathname();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(types[0]?.id ?? null);

  const active = types.find((type) => type.id === activeId) ?? types[0];
  const featured = active ? featuredByType[active.id] : undefined;

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    const onPointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open, close]);

  if (types.length === 0 || !active) return null;

  const track = (kind: string, id: string, label: string) =>
    trackCustomerEvent("select_content", {
      content_type: kind,
      item_id: id,
      item_category: label,
    });

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex h-10 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-md bg-blue-yankees px-4 font-sans text-[15px] font-semibold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2",
        )}
      >
        <Menu aria-hidden="true" className="h-5 w-5" />
        Todas las categorías
        <ChevronDown
          aria-hidden="true"
          className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
        />
      </button>

      {open ? (
        <div
          id={panelId}
          role="region"
          aria-label="Categorías de la tienda"
          className="absolute left-0 top-full z-50 mt-2 flex w-[980px] max-w-[calc(100vw-6rem)] overflow-hidden rounded-xl border border-border bg-white shadow-[0_16px_48px_rgba(34,27,65,0.22)] animate-in fade-in-0 zoom-in-95"
        >
          <ul className="flex w-[276px] shrink-0 flex-col border-r border-border bg-slate-50 p-2 font-sans text-[15px] font-medium">
            {types.map((type) => {
              const isActive = type.id === active.id;
              return (
                <li key={type.id}>
                  <Link
                    href={typePath(type)}
                    onMouseEnter={() => setActiveId(type.id)}
                    onFocus={() => setActiveId(type.id)}
                    onClick={() => track("category_type", type.slug || type.id, type.label)}
                    aria-current={isActive ? "true" : undefined}
                    className={cn(
                      "flex h-10 items-center gap-2.5 rounded-lg px-3 text-blue-yankees transition-colors hover:bg-kawaii-lavender-light focus-visible:outline-none focus-visible:bg-kawaii-lavender-light",
                      isActive && "bg-kawaii-lavender-light font-semibold",
                    )}
                  >
                    <TypeIcon
                      type={type}
                      className={cn("h-[18px] w-[18px] shrink-0", isActive ? "text-blue-yankees" : "text-muted-foreground")}
                    />
                    <span className="flex-1 truncate">{type.label}</span>
                    <ChevronRight
                      aria-hidden="true"
                      className={cn("h-4 w-4 shrink-0", isActive ? "text-blue-yankees" : "text-slate-400")}
                    />
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="flex min-w-0 flex-1 gap-8 px-8 py-6">
            <div className="flex min-w-0 flex-1 flex-col gap-3.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="font-sans text-xl font-bold text-blue-yankees">{active.label}</p>
                <Link
                  href={typePath(active)}
                  onClick={() => track("category_type", active.slug || active.id, active.label)}
                  className="flex items-center gap-1.5 font-sans text-sm font-bold text-pink-froly hover:underline"
                >
                  Ver todo {active.label}
                  <ArrowRight aria-hidden="true" className="h-4 w-4" />
                </Link>
              </div>
              {active.subcategories.length > 0 ? (
                <ul className="grid grid-cols-2 gap-x-6 gap-y-1 font-sans text-[15px] font-medium">
                  {active.subcategories.map((category) => {
                    const label = stripTaxonomyIcon(category.name);
                    return (
                      <li key={category.id}>
                        <Link
                          href={categoryPath(category.slug || category.id)}
                          onClick={() => track("category", category.slug || category.id, label)}
                          className="flex h-9 items-center text-blue-yankees hover:text-pink-froly focus-visible:outline-none focus-visible:underline"
                        >
                          {label}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Explora todos los productos de esta categoría.
                </p>
              )}
            </div>

            {featured ? (
              <Link
                href={productPath(featured.slug || featured.id)}
                onClick={() => track("featured_product", featured.slug || featured.id, active.label)}
                aria-label={`${featured.name}, producto destacado`}
                className="relative flex h-[300px] w-[250px] shrink-0 flex-col justify-end overflow-hidden rounded-xl bg-kawaii-lavender-light text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2"
              >
                <Image
                  src={featured.imageUrl}
                  alt=""
                  fill
                  sizes="250px"
                  className="object-cover"
                />
                <span aria-hidden="true" className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-blue-yankees/85" />
                <span className="absolute left-3 top-3 rounded-full bg-pink-froly px-2.5 py-1 font-sans text-[11px] font-bold uppercase tracking-wider">
                  Destacado
                </span>
                <span className="relative flex flex-col gap-1 p-4">
                  <span className="font-sans text-[17px] font-bold leading-tight">{featured.name}</span>
                  <Currency value={featured.price} className="text-sm font-semibold text-white" />
                  <span className="text-[13px] opacity-90">Ver producto →</span>
                </span>
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
