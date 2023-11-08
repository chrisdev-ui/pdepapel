"use client";

import { UserButton, useAuth } from "@clerk/nextjs";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef } from "react";

import { HamburgerMenu } from "@/components/hamburger-menu";
import { Icons } from "@/components/icons";
import { NavbarCart } from "@/components/navbar-cart";
import { NavigationLink } from "@/components/navigation-link";
import { WishlistButton } from "@/components/wishlist-button";
import { useScrollPosition } from "@/hooks/use-scroll-position";
import { cn } from "@/lib/utils";
import { FileSearch } from "lucide-react";

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
              "lg:py-0": scrollPosition > 120,
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
            <WishlistButton />
            <NavbarCart />
            {isSignedIn && (
              <UserButton afterSignOutUrl="/" userProfileMode="modal">
                <UserButton.UserProfilePage
                  label="Mis Órdenes"
                  url="/orders"
                  labelIcon={<FileSearch className="h-4 w-4" />}
                >
                  <div>Hello Orders!</div>
                </UserButton.UserProfilePage>
              </UserButton>
            )}
            {!isSignedIn && (
              <Link href="/login" className="hover:opacity-75">
                <Icons.user className="h-6 w-6" />
              </Link>
            )}
          </div>
        </div>
        {/* Responsive navbar */}
        <NavbarCart className="mr-4 hidden self-center xs:flex lg:hidden" />
        <HamburgerMenu isUserLoggedIn={!!isSignedIn} />
      </nav>
    </header>
  );
};
