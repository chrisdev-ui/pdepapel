"use client";

import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs";
import { Bookmark, PackageOpen, UserRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { AnnouncementBar } from "@/components/announcement-bar";
import { CategoryDrawer } from "@/components/category-drawer";
import { Icons } from "@/components/icons";
import { MegaMenu } from "@/components/mega-menu";
import { NavbarCart } from "@/components/navbar-cart";
import { NavigationLink } from "@/components/navigation-link";
import { SearchBar } from "@/components/search-bar";
import { WishlistButton } from "@/components/wishlist-button";
import { SEASON_CONFIG } from "@/constants";
import { useScrollPosition } from "@/hooks/use-scroll-position";
import { FeaturedByType, NavigationType } from "@/lib/catalog-navigation";
import { storefrontClerkAppearance } from "@/lib/clerk-appearance";
import { accountAccessPath, offersPath, STOREFRONT_ROUTES, typePath } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { Season } from "@/types";

interface NavbarProps {
  season?: Season;
  types: NavigationType[];
  featuredByType: FeaturedByType;
  freeShippingThreshold: number | null;
}

/** Desktop category row shows this many types before "Ofertas". */
const TOP_TYPES = 6;

/**
 * Fixed storefront header. Phones and tablets: announcement bar (hidden once
 * the visitor scrolls), a 64px bar with the category drawer, centered logo,
 * favorites and cart, then an always-visible search field. Desktop: bar,
 * 84px header with a wide search field and account actions, then the
 * category row with the mega menu. Heights are mirrored in globals.css as
 * --storefront-header-offset.
 */
const Navbar: React.FC<NavbarProps> = ({
  season = Season.Default,
  types,
  featuredByType,
  freeShippingThreshold,
}) => {
  const scrollPosition = useScrollPosition(8);
  const pathname = usePathname();
  const seasonConfig = SEASON_CONFIG[season];
  const scrolled = scrollPosition > 80;

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <AnnouncementBar
        freeShippingThreshold={freeShippingThreshold}
        className={cn("transition-[height] duration-300", scrolled && "max-lg:hidden")}
      />

      <nav aria-label="Principal" className="bg-blue-baby">
        {/* Phones and tablets */}
        <div className="flex h-16 items-center justify-between gap-2 px-3 sm:px-6 lg:hidden">
          <div className="flex w-[124px] items-center">
            <CategoryDrawer types={types} logoSrc={seasonConfig.navbarText} />
          </div>
          <Link
            href="/"
            aria-label="Papelería P de Papel, inicio"
            className="flex h-11 w-[7.5rem] shrink-0 items-center"
          >
            <Image
              src={seasonConfig.navbarText}
              alt="Logo Papelería P de Papel"
              width={120}
              height={44}
              priority
              className="h-11 w-auto max-w-full object-contain"
            />
          </Link>
          <div className="flex w-[124px] items-center justify-end gap-2">
            <WishlistButton className="flex h-11 w-11 items-center justify-center" />
            <NavbarCart className="min-w-[4.5rem]" withSheet={false} />
          </div>
        </div>
        <div className="px-3 pb-2 sm:px-6 lg:hidden">
          <SearchBar variant="inline" types={types} />
        </div>

        {/* Desktop */}
        <div className="hidden h-[84px] items-center gap-10 px-8 lg:flex xl:px-12">
          <Link
            href="/"
            aria-label="Papelería P de Papel, inicio"
            className="relative flex h-14 w-40 shrink-0 items-center"
          >
            <Image
              src={seasonConfig.navbarText}
              alt="Logo Papelería P de Papel con nombre al lado"
              width={160}
              height={58}
              priority
              className="h-14 w-auto max-w-full object-contain"
            />
            {seasonConfig.logoAccent ? (
              <Image
                src={seasonConfig.logoAccent}
                alt=""
                aria-hidden="true"
                width={640}
                height={466}
                sizes="80px"
                className="pointer-events-none absolute -right-12 -top-3 h-auto w-20 max-w-none"
              />
            ) : null}
          </Link>
          <div className="flex flex-1 justify-center">
            <SearchBar
              variant="desktop"
              placeholder="Busca cuadernos, stickers, agendas, kits…"
              types={types}
            />
          </div>
          <div className="flex shrink-0 items-center gap-5">
            <WishlistButton withLabel />
            <SignedIn>
              <UserButton
                afterSignOutUrl={STOREFRONT_ROUTES.home}
                userProfileMode="modal"
                appearance={storefrontClerkAppearance}
              >
                <UserButton.MenuItems>
                  <UserButton.Link
                    label="Mi cuenta"
                    href={STOREFRONT_ROUTES.account}
                    labelIcon={<UserRound className="h-4 w-4" />}
                  />
                  <UserButton.Link
                    label="Mis pedidos"
                    href={STOREFRONT_ROUTES.myOrders}
                    labelIcon={<PackageOpen className="h-4 w-4" />}
                  />
                  <UserButton.Link
                    label="Mis búsquedas"
                    href={STOREFRONT_ROUTES.savedSearches}
                    labelIcon={<Bookmark className="h-4 w-4" />}
                  />
                  <UserButton.Action label="manageAccount" />
                  <UserButton.Action label="signOut" />
                </UserButton.MenuItems>
              </UserButton>
            </SignedIn>
            <SignedOut>
              <Link
                href={accountAccessPath(STOREFRONT_ROUTES.signIn, pathname)}
                className="flex items-center gap-2 rounded-md font-sans font-semibold text-blue-yankees transition-opacity hover:opacity-75"
                aria-label="Mi cuenta: iniciar sesión o crear una cuenta"
              >
                <Icons.user className="h-6 w-6" />
                <span className="hidden xl:inline">Mi cuenta</span>
              </Link>
            </SignedOut>
            <NavbarCart />
          </div>
        </div>
      </nav>

      {/* Desktop category row */}
      <div className="hidden h-[52px] items-center gap-7 border-b border-border bg-white px-8 lg:flex xl:px-12">
        <MegaMenu types={types} featuredByType={featuredByType} />
        <ul className="flex items-center gap-6 whitespace-nowrap font-sans text-[15px] font-semibold">
          <li>
            <NavigationLink href={STOREFRONT_ROUTES.shop}>Tienda</NavigationLink>
          </li>
          {types.slice(0, TOP_TYPES).map((type, index) => (
            <li
              key={type.id}
              className={cn(
                "hidden",
                index < 3 ? "lg:block" : index < 5 ? "xl:block" : "2xl:block",
              )}
            >
              <NavigationLink href={typePath(type)}>{type.label}</NavigationLink>
            </li>
          ))}
          <li>
            <Link
              href={offersPath}
              className="text-rose-700 transition-opacity hover:opacity-75"
            >
              Ofertas
            </Link>
          </li>
        </ul>
        <ul className="ml-auto flex items-center gap-6 whitespace-nowrap font-sans text-sm font-semibold text-muted-foreground">
          <li>
            <NavigationLink href={STOREFRONT_ROUTES.about}>Nosotros</NavigationLink>
          </li>
          <li>
            <NavigationLink href={STOREFRONT_ROUTES.contact}>Contacto</NavigationLink>
          </li>
        </ul>
      </div>
    </header>
  );
};

export default Navbar;
