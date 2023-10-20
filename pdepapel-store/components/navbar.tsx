import { UserButton, auth } from "@clerk/nextjs";
import { ShoppingBag } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { HamburgerMenu } from "@/components/hamburger-menu";
import { Icons } from "@/components/icons";
import { NavigationLink } from "@/components/navigation-link";
import { Button } from "@/components/ui/button";

export const Navbar: React.FC<{}> = () => {
  const { userId } = auth();
  return (
    <header className="sticky left-0 top-0 z-50 mx-auto">
      <nav className="flex w-screen justify-between bg-white-rock">
        <div className="flex w-full items-center px-5 py-3 lg:py-6 xl:px-12">
          <Link href="/" className="relative h-24 w-48">
            <Image
              src="/images/text-beside-transparent-bg.webp"
              alt="Navbar Logo"
              fill
              sizes="(max-width: 640px) 100vw, 640px"
              priority
            />
          </Link>
          <ul className="mx-auto hidden space-x-12 px-4 lg:flex">
            <li>
              <NavigationLink href="/">Inicio</NavigationLink>
            </li>
            <li>
              <NavigationLink href="/shop">Tienda</NavigationLink>
            </li>
            <li>
              <NavigationLink href="/about">Nosotros</NavigationLink>
            </li>
            <li>
              <NavigationLink href="/contact">Contacto</NavigationLink>
            </li>
          </ul>
          <div className="hidden items-center space-x-5 lg:flex">
            <Link href="#" className="hover:opacity-75">
              <Icons.heart className="h-6 w-6" />
            </Link>
            <Button className="flex w-auto items-center rounded-full border-transparent bg-blue-yankees px-4 py-2 font-semibold text-white transition hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-50">
              <ShoppingBag className="h-5 w-5" />
              <span className="ml-2 flex pt-1 font-serif text-base font-medium">
                0
              </span>
            </Button>
            {userId && (
              <UserButton afterSignOutUrl="/" userProfileMode="modal" />
            )}
            {!userId && (
              <Link href="/login" className="hover:opacity-75">
                <Icons.user className="h-6 w-6" />
              </Link>
            )}
          </div>
        </div>
        {/* Responsive navbar */}
        <Button className="mr-6 flex w-auto items-center self-center rounded-full border-transparent bg-blue-yankees px-4 py-2 font-semibold text-white transition hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-50 lg:hidden">
          <ShoppingBag className="h-5 w-5" />
          <span className="ml-2 flex pt-1 font-serif text-base font-medium">
            0
          </span>
        </Button>
        <HamburgerMenu isUserLoggedIn={!!userId} />
      </nav>
    </header>
  );
};
