"use client";

import { Button } from "@/components/ui/button";
import { MercadoLibreLogo } from "@/components/mercadolibre-logo";
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
  Calculator,
  ClipboardList,
  CreditCard,
  FileSpreadsheet,
  History,
  Home,
  Image as ImageIcon,
  Layout,
  LayoutDashboard,
  LineChart,
  ListChecks,
  Menu,
  MessageSquare,
  Package,
  Palette,
  PartyPopper,
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
  const dashboardPath = (segment: string) => `/${params.storeId}/${segment}`;

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
      href: dashboardPath("productos"),
      label: ModelLabels[Models.Products],
      active: pathname === dashboardPath("productos"),
      group: "catalog",
      icon: ShoppingBag,
    },
    // Bulk Manager
    {
      href: dashboardPath("productos/gestion-masiva"),
      label: ModelLabels[Models.BulkProducts],
      active: pathname === dashboardPath("productos/gestion-masiva"),
      group: "catalog",
      icon: ListChecks,
    },
    {
      href: dashboardPath("categorias"),
      label: ModelLabels[Models.Categories],
      active: pathname === dashboardPath("categorias"),
      group: "catalog",
      icon: LayoutDashboard,
    },
    {
      href: dashboardPath("tipos"),
      label: ModelLabels[Models.Types],
      active: pathname === dashboardPath("tipos"),
      group: "catalog",
      icon: Type,
    },
    {
      href: dashboardPath("tamanos"),
      label: ModelLabels[Models.Sizes],
      active: pathname === dashboardPath("tamanos"),
      group: "catalog",
      icon: Ruler,
    },
    {
      href: dashboardPath("colores"),
      label: ModelLabels[Models.Colors],
      active: pathname === dashboardPath("colores"),
      group: "catalog",
      icon: Palette,
    },
    {
      href: dashboardPath("disenos"),
      label: ModelLabels[Models.Designs],
      active: pathname === dashboardPath("disenos"),
      group: "catalog",
      icon: Layout,
    },
    {
      href: dashboardPath("diapositivas"),
      label: ModelLabels[Models.Billboards],
      active: pathname === dashboardPath("diapositivas"),
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
      href: dashboardPath("proveedores"),
      label: ModelLabels[Models.Suppliers],
      active: pathname === dashboardPath("proveedores"),
      group: "catalog",
      icon: Archive,
    },
    {
      href: dashboardPath("cajas"),
      label: ModelLabels[Models.Boxes],
      active: pathname === dashboardPath("cajas"),
      group: "catalog",
      icon: Package,
    },
    {
      href: dashboardPath("aprovisionamiento"),
      label: ModelLabels[Models.RestockOrders],
      active: pathname.includes(dashboardPath("aprovisionamiento")),
      group: "inventory",
      icon: ClipboardList,
    },
    {
      href: dashboardPath("movimientos-inventario"),
      label: ModelLabels[Models.InventoryMovements],
      active: pathname.includes(dashboardPath("movimientos-inventario")),
      group: "inventory",
      icon: History,
    },
    {
      href: dashboardPath("inventario"),
      label: ModelLabels[Models.Inventory],
      active: pathname === dashboardPath("inventario"),
      group: "inventory",
      icon: LayoutDashboard,
    },
    // Ventas
    {
      href: dashboardPath("inteligencia-negocio"),
      label: "Business Intelligence",
      active: pathname === dashboardPath("inteligencia-negocio"),
      group: "sales",
      icon: LineChart,
    },
    {
      href: dashboardPath("reportes-tributarios"),
      label: "Reportes tributarios",
      active: pathname === dashboardPath("reportes-tributarios"),
      group: "sales",
      icon: FileSpreadsheet,
    },
    {
      href: dashboardPath("pedidos"),
      label: ModelLabels[Models.Orders],
      active: pathname === dashboardPath("pedidos"),
      group: "sales",
      icon: ShoppingCart,
    },
    {
      href: dashboardPath("ferias"),
      label: "Ventas en feria",
      active: pathname.includes(dashboardPath("ferias")),
      group: "sales",
      icon: PartyPopper,
    },
    {
      href: dashboardPath("mercadolibre"),
      label: "Mercado Libre",
      active: pathname.includes(dashboardPath("mercadolibre")),
      group: "sales",
      icon: MercadoLibreLogo,
    },
    {
      href: dashboardPath("envios"),
      label: ModelLabels[Models.Shipments],
      active: pathname === dashboardPath("envios"),
      group: "sales",
      icon: Truck,
    },
    {
      href: dashboardPath("clientes"),
      label: ModelLabels[Models.Customers],
      active: pathname === dashboardPath("clientes"),
      group: "sales",
      icon: Users,
    },

    {
      href: dashboardPath("cotizaciones"),
      label: "Cotizaciones",
      active: pathname.includes(dashboardPath("cotizaciones")),
      group: "sales",
      icon: Calculator, // Or another appropriate icon
    },
    {
      href: dashboardPath("resenas"),
      label: ModelLabels[Models.Reviews],
      active: pathname === dashboardPath("resenas"),
      group: "sales",
      icon: MessageSquare,
    },
    // Marketing
    {
      href: dashboardPath("ofertas"),
      label: ModelLabels[Models.Offers],
      active: pathname === dashboardPath("ofertas"),
      group: "marketing",
      icon: Percent,
    },
    {
      href: dashboardPath("cupones"),
      label: ModelLabels[Models.Coupons],
      active: pathname === dashboardPath("cupones"),
      group: "marketing",
      icon: Tag,
    },
    {
      href: dashboardPath("publicaciones"),
      label: ModelLabels[Models.Posts],
      active: pathname === dashboardPath("publicaciones"),
      group: "marketing",
      icon: Box,
    },
    // Configuración
    {
      href: dashboardPath("configuracion"),
      label: "Ajustes",
      active: pathname === dashboardPath("configuracion"),
      group: "settings",
      icon: Settings,
    },
  ];

  const closeMenu = () => setIsOpen(false);

  const catalogRoutes = routes.filter((r) => r.group === "catalog");
  const salesRoutes = routes.filter((r) => r.group === "sales");
  const inventoryRoutes = routes.filter((r) => r.group === "inventory");
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

            {/* Inventario */}
            <NavigationMenuItem>
              <NavigationMenuTrigger
                className={cn(
                  inventoryRoutes.some((r) => r.active) &&
                    "bg-accent text-accent-foreground",
                )}
              >
                <LayoutDashboard className="mr-2 h-4 w-4" />
                Centro de Inventario
              </NavigationMenuTrigger>
              <NavigationMenuContent>
                <ul className="grid w-[400px] gap-3 p-4 md:w-[500px] md:grid-cols-2 lg:w-[600px]">
                  {inventoryRoutes.map((route) => (
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
                href={dashboardPath("configuracion")}
                legacyBehavior
                passHref
              >
                <NavigationMenuLink
                  className={cn(
                    navigationMenuTriggerStyle(),
                    pathname === dashboardPath("configuracion") &&
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
              <h4 className="font-medium leading-none">Centro de Inventario</h4>
              <div className="grid grid-cols-1 gap-1">
                {inventoryRoutes.map((route) => (
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
                href={dashboardPath("configuracion")}
                onClick={closeMenu}
                className={cn(
                  "flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground",
                  pathname === dashboardPath("configuracion")
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
