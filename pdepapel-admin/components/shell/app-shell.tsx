"use client";

import { Breadcrumbs } from "@/components/shell/breadcrumbs";
import { CommandPalette } from "@/components/shell/command-palette";
import { MobileNav } from "@/components/shell/mobile-nav";
import { SidebarNav, type NavCounts } from "@/components/shell/sidebar-nav";
import { TopBar } from "@/components/shell/top-bar";
import { StoreSwitcher } from "@/components/store-switcher";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { useSidebarStore } from "@/hooks/use-sidebar-store";
import { cn } from "@/lib/utils";
import type { Store } from "@prisma/client";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

interface AppShellProps {
  storeId: string;
  stores: Store[];
  storeUrl?: string;
  counts?: NavCounts;
  children: React.ReactNode;
}

/**
 * Estructura del panel: barra lateral (expandida, contraída o como panel en
 * tablet y móvil), cabecera con la barra de comando, miga de pan a nivel de
 * página y barra inferior en el teléfono.
 */
export function AppShell({ storeId, stores, storeUrl, counts, children }: AppShellProps) {
  const { collapsed, toggle } = useSidebarStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      const key = event.key.toLowerCase();
      if (key === "k") {
        event.preventDefault();
        setCommandOpen((value) => !value);
      } else if (key === "b") {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  return (
    <div className="flex h-dvh overflow-hidden bg-[hsl(240_20%_98.5%)] text-foreground">
      <aside
        aria-label="Barra lateral"
        className={cn(
          "hidden shrink-0 flex-col border-r bg-white transition-[width] duration-200 lg:flex",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div className={cn("flex h-16 items-center border-b", collapsed ? "justify-center px-2" : "px-3")}>
          <StoreSwitcher items={stores} compact={collapsed} />
        </div>
        <SidebarNav storeId={storeId} counts={counts} collapsed={collapsed} />
      </aside>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" className="flex w-[300px] flex-col p-0" aria-describedby={undefined}>
          <SheetTitle className="sr-only">Menú del panel</SheetTitle>
          <div className="flex h-16 items-center border-b px-3">
            <StoreSwitcher items={stores} />
          </div>
          <SidebarNav storeId={storeId} counts={counts} onNavigate={() => setMenuOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          storeId={storeId}
          storeUrl={storeUrl}
          collapsed={collapsed}
          onToggleSidebar={toggle}
          onOpenMenu={() => setMenuOpen(true)}
          onOpenCommand={() => setCommandOpen(true)}
        />
        <main className="min-h-0 flex-1 overflow-y-auto pb-[88px] lg:pb-0">
          <Breadcrumbs storeId={storeId} className="px-4 pt-4 sm:px-8" />
          {children}
        </main>
      </div>

      <MobileNav storeId={storeId} onOpenMenu={() => setMenuOpen(true)} />
      <CommandPalette storeId={storeId} open={commandOpen} onOpenChange={setCommandOpen} />
    </div>
  );
}
