"use client";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SignInButton, SignOutButton } from "@clerk/nextjs";
import {
  Contact,
  Home,
  Info,
  LogIn,
  LogOut,
  Menu,
  ShoppingBag,
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
          <Link className="flex items-center gap-6" href="/">
            <Store className="h-6 w-6" />
            Tienda
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="flex w-full px-6 py-3 text-xl hover:bg-green-leaf hover:text-white">
          <Link className="flex items-center gap-6" href="/">
            <Info className="h-6 w-6" />
            Nosotros
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="flex w-full px-6 py-3 text-xl hover:bg-green-leaf hover:text-white">
          <Link className="flex items-center gap-6" href="/">
            <Contact className="h-6 w-6" />
            Contacto
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem className="xs:hidden flex w-full px-6 py-3 text-xl hover:bg-green-leaf hover:text-white">
          <Button className="mr-6 flex w-auto items-center self-center rounded-full border-transparent bg-blue-yankees px-4 py-2 font-semibold text-white transition hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-50">
            <ShoppingBag className="h-5 w-5" />
            <span className="ml-2 flex pt-1 font-serif text-base font-medium">
              0
            </span>
          </Button>
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
            <SignInButton />
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
