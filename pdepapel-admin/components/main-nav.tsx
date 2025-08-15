"use client";

import { ModelLabels, Models } from "@/constants";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";

export function MainNav({
  className,
  ...props
}: React.HTMLAttributes<HTMLElement>) {
  const pathname = usePathname();
  const params = useParams();
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
  return (
    <nav
      className={cn("flex items-center space-x-4 lg:space-x-6", className)}
      {...props}
    >
      {routes.map((route) => (
        <Link
          key={route.href}
          href={route.href}
          className={cn(
            "text-sm  font-medium transition-colors hover:text-primary",
            {
              "text-black dark:text-white": route.active,
              "text-muted-foreground": !route.active,
            },
          )}
        >
          {route.label}
        </Link>
      ))}
    </nav>
  );
}
