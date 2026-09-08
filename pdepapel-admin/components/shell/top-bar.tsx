"use client";

import { Button } from "@/components/ui/button";
import { dashboardHref } from "@/lib/admin-navigation";
import { UserButton } from "@clerk/nextjs";
import { ExternalLink, Menu, PanelLeftClose, PanelLeftOpen, Plus, Search } from "lucide-react";
import Link from "next/link";

interface TopBarProps {
  storeId: string;
  storeUrl?: string;
  collapsed: boolean;
  onToggleSidebar: () => void;
  onOpenMenu: () => void;
  onOpenCommand: () => void;
}

export function TopBar({ storeId, storeUrl, collapsed, onToggleSidebar, onOpenMenu, onOpenCommand }: TopBarProps) {
  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b bg-white px-3 sm:px-4 lg:px-6">
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden"
        aria-label="Abrir menú"
        onClick={onOpenMenu}
      >
        <Menu className="h-5 w-5" aria-hidden="true" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="hidden text-muted-foreground lg:inline-flex"
        aria-label={collapsed ? "Expandir menú lateral" : "Contraer menú lateral"}
        title={`${collapsed ? "Expandir" : "Contraer"} menú (⌘ B)`}
        onClick={onToggleSidebar}
      >
        {collapsed ? (
          <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
        ) : (
          <PanelLeftClose className="h-5 w-5" aria-hidden="true" />
        )}
      </Button>

      <div className="flex min-w-0 flex-1 justify-center">
        <button
          type="button"
          onClick={onOpenCommand}
          aria-label="Buscar o escribir qué quieres hacer (⌘ K)"
          className="flex h-10 w-full max-w-xl items-center gap-2.5 rounded-full border bg-muted/60 px-4 text-left text-sm text-muted-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 truncate">
            <span className="sm:hidden">¿Qué quieres hacer?</span>
            <span className="hidden sm:inline">Busca o escribe qué quieres hacer…</span>
          </span>
          <kbd className="hidden rounded border bg-white px-1.5 py-0.5 text-[11px] font-semibold text-muted-foreground sm:inline-block">
            ⌘ K
          </kbd>
        </button>
      </div>

      <div className="flex items-center gap-1">
        {storeUrl && (
          <Button asChild variant="ghost" size="sm" className="hidden md:inline-flex">
            <a href={storeUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="h-4 w-4" aria-hidden="true" />
              Ver tienda
            </a>
          </Button>
        )}
        <Button asChild size="sm">
          <Link href={dashboardHref(storeId, "pedidos/nuevo")}>
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Nuevo pedido</span>
            <span className="sr-only sm:hidden">Nuevo pedido</span>
          </Link>
        </Button>
        <div className="ml-1 flex items-center">
          <UserButton afterSignOutUrl="/" />
        </div>
      </div>
    </header>
  );
}
