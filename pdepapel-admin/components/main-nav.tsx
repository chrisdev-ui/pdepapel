"use client";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ModelLabels, Models } from "@/constants";
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
      label: "Inicio",
      active: pathname === `/${params.storeId}`,
    },
    {
      href: `/${params.storeId}/${Models.Billboards}`,
      label: ModelLabels[Models.Billboards],
      active: pathname === `/${params.storeId}/${Models.Billboards}`,
    },
    {
      href: `/${params.storeId}/${Models.Banners}`,
      label: ModelLabels[Models.Banners],
      active: pathname === `/${params.storeId}/${Models.Banners}`,
    },
    {
      href: `/${params.storeId}/${Models.Types}`,
      label: ModelLabels[Models.Types],
      active: pathname === `/${params.storeId}/${Models.Types}`,
    },
    {
      href: `/${params.storeId}/${Models.Categories}`,
      label: ModelLabels[Models.Categories],
      active: pathname === `/${params.storeId}/${Models.Categories}`,
    },
    {
      href: `/${params.storeId}/${Models.Sizes}`,
      label: ModelLabels[Models.Sizes],
      active: pathname === `/${params.storeId}/${Models.Sizes}`,
    },
    {
      href: `/${params.storeId}/${Models.Colors}`,
      label: ModelLabels[Models.Colors],
      active: pathname === `/${params.storeId}/${Models.Colors}`,
    },
    {
      href: `/${params.storeId}/${Models.Designs}`,
      label: ModelLabels[Models.Designs],
      active: pathname === `/${params.storeId}/${Models.Designs}`,
    },
    {
      href: `/${params.storeId}/${Models.Products}`,
      label: ModelLabels[Models.Products],
      active: pathname === `/${params.storeId}/${Models.Products}`,
    },
    {
      href: `/${params.storeId}/${Models.Reviews}`,
      label: ModelLabels[Models.Reviews],
      active: pathname === `/${params.storeId}/${Models.Reviews}`,
    },
    {
      href: `/${params.storeId}/${Models.Orders}`,
      label: ModelLabels[Models.Orders],
      active: pathname === `/${params.storeId}/${Models.Orders}`,
    },
    {
      href: `/${params.storeId}/${Models.Shipments}`,
      label: ModelLabels[Models.Shipments],
      active: pathname === `/${params.storeId}/${Models.Shipments}`,
    },
    {
      href: `/${params.storeId}/${Models.Customers}`,
      label: ModelLabels[Models.Customers],
      active: pathname === `/${params.storeId}/${Models.Customers}`,
    },
    {
      href: `/${params.storeId}/${Models.Posts}`,
      label: ModelLabels[Models.Posts],
      active: pathname === `/${params.storeId}/${Models.Posts}`,
    },
    {
      href: `/${params.storeId}/${Models.Suppliers}`,
      label: ModelLabels[Models.Suppliers],
      active: pathname === `/${params.storeId}/${Models.Suppliers}`,
    },
    {
      href: `/${params.storeId}/${Models.Coupons}`,
      label: ModelLabels[Models.Coupons],
      active: pathname === `/${params.storeId}/${Models.Coupons}`,
    },
    {
      href: `/${params.storeId}/settings`,
      label: "Ajustes",
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
