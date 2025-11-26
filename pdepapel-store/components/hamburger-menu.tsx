"use client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SignInButton,
  SignOutButton,
  SignedIn,
  SignedOut,
  UserButton,
} from "@clerk/nextjs";
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

export const HamburgerMenu: React.FC = () => {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Menu className="h-6 w-6 md:h-10 md:w-10 lg:hidden" />
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
            href="/shop"
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
            href="/about"
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
            href="/contact"
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
            href="/wishlist"
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
            href="/cart"
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
              href="/my-orders"
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
          <DropdownMenuItem className="flex w-full gap-6 px-6 py-3 text-xl hover:bg-blue-purple hover:text-white">
            <LogIn className="h-6 w-6" />
            <SignInButton>
              <button className="w-full text-left">Inicia sesión</button>
            </SignInButton>
          </DropdownMenuItem>
        </SignedOut>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
