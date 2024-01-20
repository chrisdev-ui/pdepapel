"use client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SignOutButton } from "@clerk/nextjs";
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

interface HamburgerMenuProps {
  isUserLoggedIn: boolean;
}

export const HamburgerMenu: React.FC<HamburgerMenuProps> = ({
  isUserLoggedIn,
}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Menu className="mr-6 h-10 w-10 self-center sm:mr-12 sm:h-6 sm:w-6 lg:hidden" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72" align="end" sideOffset={48}>
        <DropdownMenuItem className="flex w-full px-6 py-3 text-xl hover:bg-green-leaf hover:text-white">
          <Link className="flex items-center gap-6" href="/">
            <Home className="h-6 w-6" />
            Inicio
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="flex w-full px-6 py-3 text-xl hover:bg-green-leaf hover:text-white">
          <Link className="flex items-center gap-6" href="/shop">
            <Store className="h-6 w-6" />
            Tienda
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="flex w-full px-6 py-3 text-xl hover:bg-green-leaf hover:text-white">
          <Link className="flex items-center gap-6" href="/about">
            <Info className="h-6 w-6" />
            Nosotros
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="flex w-full px-6 py-3 text-xl hover:bg-green-leaf hover:text-white">
          <Link className="flex items-center gap-6" href="/contact">
            <Contact className="h-6 w-6" />
            Contacto
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="flex w-full px-6 py-3 text-xl hover:bg-green-leaf hover:text-white">
          <Link className="flex items-center gap-6" href="/wishlist">
            <Heart className="h-6 w-6" />
            Lista de deseos
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="flex w-full px-6 py-3 text-xl hover:bg-green-leaf hover:text-white xs:hidden">
          <Link className="flex items-center gap-6" href="/cart">
            <ShoppingCart className="h-6 w-6" />
            Carrito
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {isUserLoggedIn && (
          <DropdownMenuItem className="flex w-full gap-6 px-6 py-3 text-xl hover:bg-green-leaf hover:text-white">
            <LogOut className="h-6 w-6" />
            <SignOutButton />
          </DropdownMenuItem>
        )}
        {!isUserLoggedIn && (
          <DropdownMenuItem className="flex w-full gap-6 px-6 py-3 text-xl hover:bg-green-leaf hover:text-white">
            <LogIn className="h-6 w-6" />
            <Link href="/sign-in">Iniciar Sesión</Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
