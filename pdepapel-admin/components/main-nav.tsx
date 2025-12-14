"use client";

import { Button } from "@/components/ui/button";
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
  navigationMenuTriggerStyle,
} from "@/components/ui/navigation-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ModelLabels, Models } from "@/constants";
import { cn } from "@/lib/utils";
import {
  Archive,
  Award,
  Box,
  CreditCard,
  Home,
  Image as ImageIcon,
  Layout,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Package,
  Palette,
  Percent,
  Ruler,
  Settings,
  ShoppingBag,
  ShoppingCart,
  Star,
  Tag,
  Truck,
  Type,
  Users,
} from "lucide-react";
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
      group: "main",
      icon: Home,
    },
    // Catálogo
    {
      href: `/${params.storeId}/${Models.Products}`,
      label: ModelLabels[Models.Products],
      active: pathname === `/${params.storeId}/${Models.Products}`,
      group: "catalog",
      icon: ShoppingBag,
    },
    {
      href: `/${params.storeId}/${Models.Categories}`,
      label: ModelLabels[Models.Categories],
      active: pathname === `/${params.storeId}/${Models.Categories}`,
      group: "catalog",
      icon: LayoutDashboard,
    },
    {
      href: `/${params.storeId}/${Models.Types}`,
      label: ModelLabels[Models.Types],
      active: pathname === `/${params.storeId}/${Models.Types}`,
      group: "catalog",
      icon: Type,
    },
    {
      href: `/${params.storeId}/${Models.Sizes}`,
      label: ModelLabels[Models.Sizes],
      active: pathname === `/${params.storeId}/${Models.Sizes}`,
      group: "catalog",
      icon: Ruler,
    },
    {
      href: `/${params.storeId}/${Models.Colors}`,
      label: ModelLabels[Models.Colors],
      active: pathname === `/${params.storeId}/${Models.Colors}`,
      group: "catalog",
      icon: Palette,
    },
    {
      href: `/${params.storeId}/${Models.Designs}`,
      label: ModelLabels[Models.Designs],
      active: pathname === `/${params.storeId}/${Models.Designs}`,
      group: "catalog",
      icon: Layout,
    },
    {
      href: `/${params.storeId}/${Models.Billboards}`,
      label: ModelLabels[Models.Billboards],
      active: pathname === `/${params.storeId}/${Models.Billboards}`,
      group: "catalog",
      icon: ImageIcon,
    },
    {
      href: `/${params.storeId}/${Models.Banners}`,
      label: ModelLabels[Models.Banners],
      active: pathname === `/${params.storeId}/${Models.Banners}`,
      group: "catalog",
      icon: Star,
    },
    {
      href: `/${params.storeId}/${Models.Suppliers}`,
      label: ModelLabels[Models.Suppliers],
      active: pathname === `/${params.storeId}/${Models.Suppliers}`,
      group: "catalog",
      icon: Archive,
    },
    {
      href: `/${params.storeId}/${Models.Boxes}`,
      label: ModelLabels[Models.Boxes],
      active: pathname === `/${params.storeId}/${Models.Boxes}`,
      group: "catalog",
      icon: Package,
    },
    // Ventas
    {
      href: `/${params.storeId}/${Models.Orders}`,
      label: ModelLabels[Models.Orders],
      active: pathname === `/${params.storeId}/${Models.Orders}`,
      group: "sales",
      icon: ShoppingCart,
    },
    {
      href: `/${params.storeId}/${Models.Shipments}`,
      label: ModelLabels[Models.Shipments],
      active: pathname === `/${params.storeId}/${Models.Shipments}`,
      group: "sales",
      icon: Truck,
    },
    {
      href: `/${params.storeId}/${Models.Customers}`,
      label: ModelLabels[Models.Customers],
      active: pathname === `/${params.storeId}/${Models.Customers}`,
      group: "sales",
      icon: Users,
    },
    {
      href: `/${params.storeId}/${Models.Reviews}`,
      label: ModelLabels[Models.Reviews],
      active: pathname === `/${params.storeId}/${Models.Reviews}`,
      group: "sales",
      icon: MessageSquare,
    },
    // Marketing
    {
      href: `/${params.storeId}/${Models.Offers}`,
      label: ModelLabels[Models.Offers],
      active: pathname === `/${params.storeId}/${Models.Offers}`,
      group: "marketing",
      icon: Percent,
    },
    {
      href: `/${params.storeId}/${Models.Coupons}`,
      label: ModelLabels[Models.Coupons],
      active: pathname === `/${params.storeId}/${Models.Coupons}`,
      group: "marketing",
      icon: Tag,
    },
    {
      href: `/${params.storeId}/${Models.Posts}`,
      label: ModelLabels[Models.Posts],
      active: pathname === `/${params.storeId}/${Models.Posts}`,
      group: "marketing",
      icon: Box,
    },
    // Configuración
    {
      href: `/${params.storeId}/settings`,
      label: "Ajustes",
      active: pathname === `/${params.storeId}/settings`,
      group: "settings",
      icon: Settings,
    },
  ];

  const closeMenu = () => setIsOpen(false);

  const catalogRoutes = routes.filter((r) => r.group === "catalog");
  const salesRoutes = routes.filter((r) => r.group === "sales");
  const marketingRoutes = routes.filter((r) => r.group === "marketing");

  return (
    <>
      {/* Desktop Navigation - xl and up */}
      <div className={cn("hidden xl:block", className)} {...props}>
        <NavigationMenu>
          <NavigationMenuList>
            {/* Inicio */}
            <NavigationMenuItem>
              <Link href={`/${params.storeId}`} legacyBehavior passHref>
                <NavigationMenuLink
                  className={cn(
                    navigationMenuTriggerStyle(),
                    pathname === `/${params.storeId}` &&
                      "bg-accent text-accent-foreground",
                  )}
                >
                  <Home className="mr-2 h-4 w-4" />
                  Inicio
                </NavigationMenuLink>
              </Link>
            </NavigationMenuItem>

            {/* Catálogo */}
            <NavigationMenuItem>
              <NavigationMenuTrigger
                className={cn(
                  catalogRoutes.some((r) => r.active) &&
                    "bg-accent text-accent-foreground",
                )}
              >
                <Package className="mr-2 h-4 w-4" />
                Catálogo
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
                  {catalogRoutes.map((route) => (
                    <ListItem
                      key={route.href}
                      title={route.label}
                      href={route.href}
                      active={route.active}
                      icon={route.icon}
                    />
                  ))}
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>

            {/* Ventas */}
            <NavigationMenuItem>
              <NavigationMenuTrigger
                className={cn(
                  salesRoutes.some((r) => r.active) &&
                    "bg-accent text-accent-foreground",
                )}
              >
                <CreditCard className="mr-2 h-4 w-4" />
                Ventas
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
                  {salesRoutes.map((route) => (
                    <ListItem
                      key={route.href}
                      title={route.label}
                      href={route.href}
                      active={route.active}
                      icon={route.icon}
                    />
                  ))}
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>

            {/* Marketing */}
            <NavigationMenuItem>
              <NavigationMenuTrigger
                className={cn(
                  marketingRoutes.some((r) => r.active) &&
                    "bg-accent text-accent-foreground",
                )}
              >
                <Award className="mr-2 h-4 w-4" />
                Marketing
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
                  {marketingRoutes.map((route) => (
                    <ListItem
                      key={route.href}
                      title={route.label}
                      href={route.href}
                      active={route.active}
                      icon={route.icon}
                    />
                  ))}
                </ul>
              </NavigationMenuContent>
            </NavigationMenuItem>

            {/* Ajustes */}
            <NavigationMenuItem>
              <Link
                href={`/${params.storeId}/settings`}
                legacyBehavior
                passHref
              >
                <NavigationMenuLink
                  className={cn(
                    navigationMenuTriggerStyle(),
                    pathname === `/${params.storeId}/settings` &&
                      "bg-accent text-accent-foreground",
                  )}
                >
                  <Settings className="mr-2 h-4 w-4" />
                  Ajustes
                </NavigationMenuLink>
              </Link>
            </NavigationMenuItem>
          </NavigationMenuList>
        </NavigationMenu>
      </div>

      {/* Mobile Navigation - up to xl */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild className="xl:hidden">
          <Button variant="ghost" size="sm" className="px-2">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Abrir menú</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[300px] overflow-y-auto">
          <nav className="flex flex-col space-y-6 py-6">
            <div className="space-y-3">
              <h4 className="font-medium leading-none">General</h4>
              <Link
                href={`/${params.storeId}`}
                onClick={closeMenu}
                className={cn(
                  "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                  pathname === `/${params.storeId}`
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground",
                )}
              >
                <Home className="mr-2 h-4 w-4" />
                Inicio
              </Link>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium leading-none">Catálogo</h4>
              <div className="grid grid-cols-1 gap-1">
                {catalogRoutes.map((route) => (
                  <Link
                    key={route.href}
                    href={route.href}
                    onClick={closeMenu}
                    className={cn(
                      "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                      route.active
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    <route.icon className="mr-2 h-4 w-4" />
                    {route.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium leading-none">Ventas</h4>
              <div className="grid grid-cols-1 gap-1">
                {salesRoutes.map((route) => (
                  <Link
                    key={route.href}
                    href={route.href}
                    onClick={closeMenu}
                    className={cn(
                      "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                      route.active
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    <route.icon className="mr-2 h-4 w-4" />
                    {route.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium leading-none">Marketing</h4>
              <div className="grid grid-cols-1 gap-1">
                {marketingRoutes.map((route) => (
                  <Link
                    key={route.href}
                    href={route.href}
                    onClick={closeMenu}
                    className={cn(
                      "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                      route.active
                        ? "bg-accent text-accent-foreground"
                        : "text-muted-foreground",
                    )}
                  >
                    <route.icon className="mr-2 h-4 w-4" />
                    {route.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="font-medium leading-none">Configuración</h4>
              <Link
                href={`/${params.storeId}/settings`}
                onClick={closeMenu}
                className={cn(
                  "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                  pathname === `/${params.storeId}/settings`
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground",
                )}
              >
                <Settings className="mr-2 h-4 w-4" />
                Ajustes
              </Link>
            </div>
          </nav>
        </SheetContent>
      </Sheet>
    </>
  );
}

const ListItem = ({
  className,
  title,
  children,
  href,
  active,
  icon: Icon,
  ...props
}: React.ComponentPropsWithoutRef<"a"> & {
  active?: boolean;
  icon?: any;
}) => {
  return (
    <li>
      <NavigationMenuLink asChild>
        <Link
          href={href!}
          className={cn(
            "block select-none space-y-1 rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground",
            active && "bg-accent text-accent-foreground",
            className,
          )}
          {...props}
        >
          <div className="flex items-center text-sm font-medium leading-none">
            {Icon && <Icon className="mr-2 h-4 w-4" />}
            {title}
          </div>
          <p className="line-clamp-2 text-sm leading-snug text-muted-foreground">
            {children}
          </p>
        </Link>
      </NavigationMenuLink>
    </li>
  );
};
