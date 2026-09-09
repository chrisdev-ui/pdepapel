"use client";

import { SignedIn, SignedOut } from "@clerk/nextjs";
import { ArrowRight, Bookmark, Heart, LayoutGrid, Mail, Menu, PackageOpen, Store, Tag, User, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { stripTaxonomyIcon } from "@/lib/catalog-labels";
import { NavigationType } from "@/lib/catalog-navigation";
import { trackCustomerEvent } from "@/lib/customer-analytics";
import {
  accountAccessPath,
  categoryPath,
  offersPath,
  STOREFRONT_ROUTES,
  typePath,
} from "@/lib/routes";
import { TypeIcon } from "@/lib/type-icons";
import { cn } from "@/lib/utils";

interface CategoryDrawerProps {
  types: NavigationType[];
  logoSrc: string;
}

const rowClass =
  "flex min-h-[56px] w-full items-center gap-3.5 border-b border-slate-100 px-4 text-left font-sans text-base font-medium text-blue-yankees transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:bg-slate-50";

/**
 * Phone and tablet navigation: a left drawer that lists every catalog type
 * with its subcategories (accordion), the offers and info pages, and the
 * account shortcuts. Replaces the old five-link dropdown.
 */
export function CategoryDrawer({ types, logoSrc }: CategoryDrawerProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Navigating anywhere closes the drawer.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const track = (kind: string, id: string, label: string) =>
    trackCustomerEvent("select_content", {
      content_type: kind,
      item_id: id,
      item_category: label,
    });

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          aria-label={open ? "Cerrar menú de categorías" : "Abrir menú de categorías"}
          className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-md text-blue-yankees transition-colors hover:bg-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2 focus-visible:ring-offset-blue-baby lg:hidden"
        >
          <Menu aria-hidden="true" className="h-[26px] w-[26px]" />
        </button>
      </SheetTrigger>
      <SheetContent
        side="left"
        aria-describedby={undefined}
        className="flex w-[92vw] max-w-[360px] flex-col gap-0 p-0 sm:max-w-[360px]"
      >
        <SheetTitle className="sr-only">Menú de categorías</SheetTitle>
        <div className="relative flex h-[76px] shrink-0 items-center justify-center border-b border-border">
          <Link href="/" aria-label="Papelería P de Papel, inicio" className="relative h-14 w-28">
            <Image src={logoSrc} alt="" fill sizes="112px" className="object-contain" />
          </Link>
          <SheetClose
            aria-label="Cerrar menú"
            className="absolute right-2 top-4 flex h-11 w-11 touch-manipulation items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees"
          >
            <X aria-hidden="true" className="h-6 w-6" />
          </SheetClose>
        </div>

        <nav aria-label="Categorías" className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <Link
            href={STOREFRONT_ROUTES.shop}
            className={cn(rowClass, "border-b border-border font-semibold")}
          >
            <LayoutGrid aria-hidden="true" className="h-6 w-6 shrink-0" />
            <span className="flex-1">Todos los productos</span>
            <ArrowRight aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
          </Link>
          <Accordion type="single" collapsible className="w-full">
            {types.map((type) =>
              type.subcategories.length === 0 ? (
                <Link
                  key={type.id}
                  href={typePath(type)}
                  onClick={() => track("category_type", type.slug || type.id, type.label)}
                  className={rowClass}
                >
                  <TypeIcon type={type} className="h-6 w-6 shrink-0 text-muted-foreground" />
                  <span className="flex-1">{type.label}</span>
                </Link>
              ) : (
                <AccordionItem key={type.id} value={type.id} className="border-0">
                  <AccordionTrigger
                    className={cn(
                      rowClass,
                      "py-0 hover:no-underline data-[state=open]:bg-[#F5F2FC] data-[state=open]:font-semibold [&>svg]:h-5 [&>svg]:w-5 [&>svg]:text-muted-foreground",
                    )}
                  >
                    <span className="flex flex-1 items-center gap-3.5">
                      <TypeIcon type={type} className="h-6 w-6 shrink-0 text-muted-foreground" />
                      <span>{type.label}</span>
                    </span>
                  </AccordionTrigger>
                  <AccordionContent className="border-b border-slate-100 bg-[#FAF8FE] pb-2 pt-1">
                    <ul>
                      {type.subcategories.map((category) => {
                        const label = stripTaxonomyIcon(category.name);
                        return (
                          <li key={category.id}>
                            <Link
                              href={categoryPath(category.slug || category.id)}
                              onClick={() => track("category", category.slug || category.id, label)}
                              className="flex min-h-11 items-center py-2 pl-14 pr-4 font-sans text-[15px] font-medium leading-tight text-blue-yankees hover:text-pink-froly focus-visible:outline-none focus-visible:underline"
                            >
                              {label}
                            </Link>
                          </li>
                        );
                      })}
                      <li>
                        <Link
                          href={typePath(type)}
                          onClick={() => track("category_type", type.slug || type.id, type.label)}
                          className="flex min-h-11 items-center gap-1.5 py-2 pl-14 pr-4 font-sans text-[15px] font-bold text-pink-froly hover:underline focus-visible:outline-none focus-visible:underline"
                        >
                          Ver todo {type.label}
                          <ArrowRight aria-hidden="true" className="h-4 w-4" />
                        </Link>
                      </li>
                    </ul>
                  </AccordionContent>
                </AccordionItem>
              ),
            )}
          </Accordion>

          <Link href={offersPath} className={cn(rowClass, "font-semibold text-pink-froly")}>
            <Tag aria-hidden="true" className="h-6 w-6 shrink-0" />
            <span className="flex-1">Ofertas</span>
          </Link>
          <Link href={STOREFRONT_ROUTES.about} className={rowClass}>
            <Store aria-hidden="true" className="h-6 w-6 shrink-0 text-muted-foreground" />
            <span className="flex-1">Nosotros</span>
          </Link>
          <Link href={STOREFRONT_ROUTES.contact} className={rowClass}>
            <Mail aria-hidden="true" className="h-6 w-6 shrink-0 text-muted-foreground" />
            <span className="flex-1">Contacto</span>
          </Link>
        </nav>

        <div className="grid shrink-0 grid-cols-2 gap-2 border-t border-border bg-slate-50 px-3 py-2.5">
          <SignedOut>
            <Link
              href={accountAccessPath(STOREFRONT_ROUTES.signIn, pathname)}
              className="flex h-11 items-center justify-center gap-2 rounded-md bg-blue-yankees font-sans text-sm font-semibold text-white transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2"
            >
              <User aria-hidden="true" className="h-[18px] w-[18px]" />
              Iniciar sesión
            </Link>
          </SignedOut>
          <SignedIn>
            <Link
              href={STOREFRONT_ROUTES.myOrders}
              className="flex h-11 items-center justify-center gap-2 rounded-md bg-blue-yankees font-sans text-sm font-semibold text-white transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2"
            >
              <PackageOpen aria-hidden="true" className="h-[18px] w-[18px]" />
              Mis pedidos
            </Link>
          </SignedIn>
          <SignedIn>
            <Link
              href={STOREFRONT_ROUTES.savedSearches}
              className="col-span-2 flex h-11 items-center justify-center gap-2 rounded-md border-[1.5px] border-blue-yankees font-sans text-sm font-semibold text-blue-yankees transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2"
            >
              <Bookmark aria-hidden="true" className="h-[18px] w-[18px]" />
              Mis búsquedas
            </Link>
          </SignedIn>
          <Link
            href={STOREFRONT_ROUTES.wishlist}
            className="flex h-11 items-center justify-center gap-2 rounded-md border-[1.5px] border-blue-yankees font-sans text-sm font-semibold text-blue-yankees transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2"
          >
            <Heart aria-hidden="true" className="h-[18px] w-[18px]" />
            Favoritos
          </Link>
        </div>
      </SheetContent>
    </Sheet>
  );
}
