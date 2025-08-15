"use client";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { Menu } from "lucide-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useState } from "react";

export function MainNav({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  const pathname = usePathname();
  const params = useParams();
  const [isOpen, setIsOpen] = useState(false);

  const routes = [
    {
      href: `/${params.storeId}`,
      label: "Resumen",
      active: pathname === `/${params.storeId}`,
    },
    {
      href: `/${params.storeId}/billboards`,
      label: "Vallas publicitarias",
      active: pathname === `/${params.storeId}/billboards`,
    },
    {
      href: `/${params.storeId}/categories`,
      label: "Categorías",
      active: pathname === `/${params.storeId}/categories`,
    },
    {
      href: `/${params.storeId}/sizes`,
      label: "Tallas",
      active: pathname === `/${params.storeId}/sizes`,
    },
    {
      href: `/${params.storeId}/colors`,
      label: "Colores",
      active: pathname === `/${params.storeId}/colors`,
    },
    {
      href: `/${params.storeId}/products`,
      label: "Productos",
      active: pathname === `/${params.storeId}/products`,
    },
    {
      href: `/${params.storeId}/orders`,
      label: "Órdenes",
      active: pathname === `/${params.storeId}/orders`,
    },
    {
      href: `/${params.storeId}/customers`,
      label: "Clientes",
      active: pathname === `/${params.storeId}/customers`,
    },
    {
      href: `/${params.storeId}/coupons`,
      label: "Cupones",
      active: pathname === `/${params.storeId}/coupons`,
    },
    {
      href: `/${params.storeId}/settings`,
      label: "Configuración",
      active: pathname === `/${params.storeId}/settings`,
    },
  ];

  const closeMenu = () => setIsOpen(false);

  return (
    <>
      {/* Desktop Navigation - xl and up (1280px+) */}
      <nav
        className={cn(
          "hidden items-center space-x-4 xl:flex xl:space-x-6",
          className,
        )}
        {...props}
      >
        {routes.map((route) => (
          <Link
            key={route.href}
            href={route.href}
            className={cn(
              "text-sm font-medium transition-colors hover:text-primary",
              route.active
                ? "text-black dark:text-white"
                : "text-muted-foreground",
            )}
          >
            {route.label}
          </Link>
        ))}
      </nav>

      {/* Mobile Navigation - up to xl (below 1280px) */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild className="xl:hidden">
          <Button variant="ghost" size="sm" className="px-2">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Abrir menú</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[280px] sm:w-[320px]">
          <nav className="flex flex-col space-y-2 py-10">
            {routes.map((route) => (
              <Link
                key={route.href}
                href={route.href}
                onClick={closeMenu}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                  route.active
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground",
                )}
              >
                {route.label}
              </Link>
            ))}
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}
