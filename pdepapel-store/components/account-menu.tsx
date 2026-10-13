"use client";

import { useClerk, useUser } from "@clerk/nextjs";
import { Bookmark, LogOut, PackageOpen, Settings, UserRound } from "lucide-react";
import { useState } from "react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { STOREFRONT_ROUTES } from "@/lib/routes";

/** Abre el perfil de Clerk al llegar a Mi cuenta (lo lee `AccountHub`). */
export const MANAGE_ACCOUNT_PARAM = "perfil";

const ITEM_CLASS = "flex min-h-[40px] cursor-pointer items-center gap-3 rounded-lg px-3 font-sans text-sm text-blue-yankees focus:bg-pink-shell/15 focus:text-blue-yankees";

/**
 * El menú de la cuenta en la cabecera, en lugar de `<UserButton>` de Clerk:
 * aquel necesita los componentes de interfaz de Clerk, que ya no se cargan en
 * las páginas públicas. Los enlaces son `<a>` porque llevan a páginas con
 * Clerk completo.
 */
export function AccountMenu() {
  const { isLoaded, user } = useUser();
  const { signOut } = useClerk();
  const [signingOut, setSigningOut] = useState(false);

  if (!isLoaded || !user) {
    return <span aria-hidden="true" className="block h-8 w-8 rounded-full bg-muted" />;
  }

  const name = user.fullName || user.firstName || user.primaryEmailAddress?.emailAddress || "Mi cuenta";
  const email = user.primaryEmailAddress?.emailAddress;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="Abrir menú de usuario"
          className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-full ring-offset-2 transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-yankees"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- la foto viene de Clerk, fuera del cargador de imágenes */}
          <img src={user.imageUrl} alt="" width={32} height={32} className="h-8 w-8 rounded-full object-cover" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-72 rounded-2xl border border-pink-shell/30 bg-white p-2 shadow-[0_4px_20px_hsl(280_30%_70%/0.15)]"
      >
        <DropdownMenuLabel className="flex items-center gap-3 px-3 py-2 font-normal">
          {/* eslint-disable-next-line @next/next/no-img-element -- la foto viene de Clerk, fuera del cargador de imágenes */}
          <img src={user.imageUrl} alt="" width={36} height={36} className="h-9 w-9 shrink-0 rounded-full object-cover" />
          <span className="min-w-0">
            <span className="block truncate font-sans text-sm font-semibold text-blue-yankees">{name}</span>
            {email && email !== name ? <span className="block truncate text-xs text-muted-foreground">{email}</span> : null}
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className={ITEM_CLASS}>
          <a href={STOREFRONT_ROUTES.account}>
            <UserRound aria-hidden="true" className="h-4 w-4" />
            Mi cuenta
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={ITEM_CLASS}>
          <a href={STOREFRONT_ROUTES.myOrders}>
            <PackageOpen aria-hidden="true" className="h-4 w-4" />
            Mis pedidos
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem asChild className={ITEM_CLASS}>
          <a href={STOREFRONT_ROUTES.savedSearches}>
            <Bookmark aria-hidden="true" className="h-4 w-4" />
            Mis búsquedas
          </a>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild className={ITEM_CLASS}>
          <a href={`${STOREFRONT_ROUTES.account}?${MANAGE_ACCOUNT_PARAM}=1`}>
            <Settings aria-hidden="true" className="h-4 w-4" />
            Administrar cuenta
          </a>
        </DropdownMenuItem>
        <DropdownMenuItem
          className={ITEM_CLASS}
          disabled={signingOut}
          onSelect={(event) => {
            event.preventDefault();
            setSigningOut(true);
            void signOut({ redirectUrl: STOREFRONT_ROUTES.home });
          }}
        >
          <LogOut aria-hidden="true" className="h-4 w-4" />
          {signingOut ? "Cerrando sesión…" : "Cerrar sesión"}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
