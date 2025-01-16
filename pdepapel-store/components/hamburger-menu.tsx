"use client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignOutButton,
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

export const HamburgerMenu: React.FC = () => {
  const pathname = usePathname();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Menu className="h-6 w-6 md:h-10 md:w-10 lg:hidden" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-72" align="end" sideOffset={10}>
        <DropdownMenuItem className="flex w-full px-6 py-3 text-xl hover:bg-blue-purple hover:text-white">
          <Link className="flex w-full items-center gap-6" href="/">
            <Home className="h-6 w-6" />
            Inicio
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="flex w-full px-6 py-3 text-xl hover:bg-blue-purple hover:text-white">
          <Link className="flex w-full items-center gap-6" href="/shop">
            <Store className="h-6 w-6" />
            Tienda
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="flex w-full px-6 py-3 text-xl hover:bg-blue-purple hover:text-white">
          <Link className="flex w-full items-center gap-6" href="/about">
            <Info className="h-6 w-6" />
            Nosotros
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="flex w-full px-6 py-3 text-xl hover:bg-blue-purple hover:text-white">
          <Link className="flex w-full items-center gap-6" href="/contact">
            <Contact className="h-6 w-6" />
            Contacto
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="flex w-full px-6 py-3 text-xl hover:bg-blue-purple hover:text-white">
          <Link className="flex w-full items-center gap-6" href="/wishlist">
            <Heart className="h-6 w-6" />
            Lista de deseos
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="flex w-full px-6 py-3 text-xl hover:bg-blue-purple hover:text-white xs:hidden">
          <Link className="flex w-full items-center gap-6" href="/cart">
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
          <DropdownMenuItem className="flex w-full px-6 py-3 text-xl hover:bg-blue-purple hover:text-white">
            <Link className="flex w-full items-center gap-6" href="/my-orders">
              <Contact className="h-6 w-6" />
              Mis órdenes
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem className="flex w-full gap-6 px-6 py-3 text-xl hover:bg-blue-purple hover:text-white">
            <LogOut className="h-6 w-6" />
            <SignOutButton>
              <button className="w-full text-left">Cerrar sesión</button>
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
