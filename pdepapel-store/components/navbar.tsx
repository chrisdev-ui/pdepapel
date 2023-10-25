"use client";
import { UserButton, useAuth } from "@clerk/nextjs";
import { ShoppingBag } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { HamburgerMenu } from "@/components/hamburger-menu";
import { Icons } from "@/components/icons";
import { NavigationLink } from "@/components/navigation-link";
import { Button } from "@/components/ui/button";
import { useScrollPosition } from "@/hooks/use-scroll-position";
import { cn } from "@/lib/utils";
import { useEffect, useRef } from "react";

export const Navbar: React.FC<{}> = () => {
  const { isSignedIn } = useAuth();
  const scrollPosition = useScrollPosition();
  const navBarRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (typeof window !== undefined && scrollPosition > 120) {
      const navbarHeight = navBarRef.current
        ? navBarRef.current.offsetHeight
        : 0;
      document.body.style.paddingTop = `${navbarHeight}px`;
    }
    return () => {
      document.body.style.paddingTop = "144px";
    };
  }, [scrollPosition]);

  return (
    <header className="fixed left-0 top-0 z-50 mx-auto" ref={navBarRef}>
      <nav className="flex w-screen justify-between bg-white-rock">
        <div
          className={cn(
            "flex w-full items-center px-5 py-3 transition-[padding] duration-300 lg:py-6 xl:px-12",
            {
              "lg:p-0": scrollPosition > 120,
            },
          )}
        >
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
            {isSignedIn && (
              <UserButton afterSignOutUrl="/" userProfileMode="modal" />
            )}
            {!isSignedIn && (
              <Link href="/login" className="hover:opacity-75">
                <Icons.user className="h-6 w-6" />
              </Link>
            )}
          </div>
        </div>
        {/* Responsive navbar */}
        <Button className="mr-6 hidden w-auto items-center self-center rounded-full border-transparent bg-blue-yankees px-4 py-2 font-semibold text-white transition hover:opacity-75 disabled:cursor-not-allowed disabled:opacity-50 xs:flex lg:hidden">
          <ShoppingBag className="h-5 w-5" />
          <span className="ml-2 flex pt-1 font-serif text-base font-medium">
            0
          </span>
        </Button>
        <HamburgerMenu isUserLoggedIn={!!isSignedIn} />
      </nav>
    </header>
  );
};
