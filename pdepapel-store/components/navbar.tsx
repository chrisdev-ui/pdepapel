"use client";

import { SignedIn, SignedOut, UserButton, useAuth } from "@clerk/nextjs";
import { FileSearch } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { HamburgerMenu } from "@/components/hamburger-menu";
import { Icons } from "@/components/icons";
import { NavbarCart } from "@/components/navbar-cart";
import { NavigationLink } from "@/components/navigation-link";
import { OrderHistory } from "@/components/order-history";
import { SearchBar } from "@/components/search-bar";
import { WishlistButton } from "@/components/wishlist-button";
import { useScrollPosition } from "@/hooks/use-scroll-position";
import { cn } from "@/lib/utils";

const Navbar: React.FC<{}> = () => {
  const { isSignedIn } = useAuth();
  const scrollPosition = useScrollPosition();
  const pathname = usePathname();

  const navBarRef = useRef<HTMLElement>(null);
  const [displaySearchbox, setDisplaySearchbox] = useState<boolean>(false);

  const toggleSearch = useCallback((open: boolean) => {
    setDisplaySearchbox(open);
  }, []);

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
      <nav className="flex w-screen items-center justify-between gap-4 bg-blue-baby">
        <div
          className={cn(
            "flex items-center p-3 transition-all duration-300 md:w-full lg:py-6 xl:px-12",
            {
              "lg:py-0": scrollPosition > 120,
              "w-0 px-0 lg:w-full lg:px-5": displaySearchbox,
            },
          )}
        >
          <Link
            href="/"
            className={cn(
              "relative hidden transition-all duration-500 ease-in-out md:block md:h-24 md:w-48",
              {
                "md:w-0 xl:w-48": displaySearchbox,
              },
            )}
          >
            <Image
              src="/images/text-beside-transparent-bg.webp"
              alt="Logo Papelería P de Papel con nombre al lado"
              fill
              sizes="(max-width: 640px) 100vw, 640px"
              priority
            />
          </Link>
          <Link
            href="/"
            className={cn(
              "relative h-24 w-24 transition-all duration-500 ease-in-out md:hidden",
              {
                "w-0": displaySearchbox,
              },
            )}
          >
            <Image
              src="/images/no-text-transparent-bg.webp"
              alt="Logo Papelería P de Papel"
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
            <SearchBar
              displaySearchbox={displaySearchbox}
              toggleSearch={toggleSearch}
            />
            <WishlistButton />
            <NavbarCart />
            <SignedIn>
              <UserButton afterSignOutUrl="/" userProfileMode="modal">
                <UserButton.UserProfilePage
                  label="Mis Órdenes"
                  url="/orders"
                  labelIcon={<FileSearch className="h-4 w-4" />}
                >
                  <OrderHistory />
                </UserButton.UserProfilePage>
              </UserButton>
            </SignedIn>
            <SignedOut>
              <Link
                href={`/sign-in?redirectUrl=${pathname}`}
                className="hover:opacity-75"
              >
                <Icons.user className="h-6 w-6" />
              </Link>
            </SignedOut>
          </div>
        </div>
        {/* Responsive navbar */}
        <div
          className={cn("flex items-center gap-3 px-6 lg:hidden", {
            "gap-2 px-2": displaySearchbox,
          })}
        >
          <SearchBar
            displaySearchbox={displaySearchbox}
            toggleSearch={toggleSearch}
            className="flex lg:hidden"
          />
          <NavbarCart className="hidden self-center xs:flex lg:hidden" />
          <HamburgerMenu isUserLoggedIn={!!isSignedIn} />
        </div>
      </nav>
    </header>
  );
};

export default Navbar;
