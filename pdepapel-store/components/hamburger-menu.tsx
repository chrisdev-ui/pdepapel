"use client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SignOutButton, SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import {
  Contact,
  Heart,
  Home,
  Info,
  LogIn,
  LogOut,
  Menu,
  ShoppingCart,
  Store,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { accountAccessPath, STOREFRONT_ROUTES } from "@/lib/routes";

export const HamburgerMenu: React.FC = () => {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={open ? "Cerrar menú de navegación" : "Abrir menú de navegación"}
          className="flex h-11 w-11 touch-manipulation items-center justify-center rounded-md text-blue-yankees transition-colors hover:bg-white/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees focus-visible:ring-offset-2 focus-visible:ring-offset-blue-baby lg:hidden"
        >
          <Menu aria-hidden="true" className="h-6 w-6 md:h-7 md:w-7" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72" align="end" sideOffset={10}>
        <DropdownMenuItem
          className="flex w-full px-6 py-3 text-xl hover:bg-blue-purple hover:text-white"
          asChild
        >
          <Link
            className="flex w-full items-center gap-6"
            href="/"
            onClick={() => setOpen(false)}
          >
            <Home className="h-6 w-6" />
            Inicio
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex w-full px-6 py-3 text-xl hover:bg-blue-purple hover:text-white"
          asChild
        >
          <Link
            className="flex w-full items-center gap-6"
            href={STOREFRONT_ROUTES.shop}
            onClick={() => setOpen(false)}
          >
            <Store className="h-6 w-6" />
            Tienda
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex w-full px-6 py-3 text-xl hover:bg-blue-purple hover:text-white"
          asChild
        >
          <Link
            className="flex w-full items-center gap-6"
            href={STOREFRONT_ROUTES.about}
            onClick={() => setOpen(false)}
          >
            <Info className="h-6 w-6" />
            Nosotros
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex w-full px-6 py-3 text-xl hover:bg-blue-purple hover:text-white"
          asChild
        >
          <Link
            className="flex w-full items-center gap-6"
            href={STOREFRONT_ROUTES.contact}
            onClick={() => setOpen(false)}
          >
            <Contact className="h-6 w-6" />
            Contacto
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex w-full px-6 py-3 text-xl hover:bg-blue-purple hover:text-white"
          asChild
        >
          <Link
            className="flex w-full items-center gap-6"
            href={STOREFRONT_ROUTES.wishlist}
            onClick={() => setOpen(false)}
          >
            <Heart className="h-6 w-6" />
            Lista de deseos
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem
          className="flex w-full px-6 py-3 text-xl hover:bg-blue-purple hover:text-white xs:hidden"
          asChild
        >
          <Link
            className="flex w-full items-center gap-6"
            href={STOREFRONT_ROUTES.cart}
            onClick={() => setOpen(false)}
          >
            <ShoppingCart className="h-6 w-6" />
            Carrito
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <SignedIn>
          <DropdownMenuItem className="flex w-full px-6 py-3 text-xl hover:bg-blue-purple hover:text-white">
            <UserButton
              afterSignOutUrl="/"
              showName
              appearance={{
                elements: {
                  rootBox: "w-full",
                  userButtonBox:
                    "flex items-center justify-end flex-row-reverse",
                },
              }}
            />
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex w-full px-6 py-3 text-xl hover:bg-blue-purple hover:text-white"
            asChild
          >
            <Link
              className="flex w-full items-center gap-6"
              href={STOREFRONT_ROUTES.myOrders}
              onClick={() => setOpen(false)}
            >
              <Contact className="h-6 w-6" />
              Mis órdenes
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="flex w-full gap-6 px-6 py-3 text-xl hover:bg-blue-purple hover:text-white">
            <LogOut className="h-6 w-6" />
            <SignOutButton>
              <button
                className="w-full text-left"
                onClick={() => setOpen(false)}
              >
                Cerrar sesión
              </button>
            </SignOutButton>
          </DropdownMenuItem>
        </SignedIn>
        <SignedOut>
          <DropdownMenuItem
            className="flex w-full px-6 py-3 text-xl hover:bg-blue-purple hover:text-white"
            asChild
          >
            <Link
              className="flex w-full items-center gap-6"
              href={accountAccessPath(STOREFRONT_ROUTES.signIn, pathname)}
              onClick={() => setOpen(false)}
            >
              <LogIn className="h-6 w-6" />
              Inicia sesión o crea tu cuenta
            </Link>
          </DropdownMenuItem>
        </SignedOut>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
