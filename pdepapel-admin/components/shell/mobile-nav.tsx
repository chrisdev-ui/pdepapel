"use client";

import { MOBILE_NAV, dashboardHref, isSegmentActive } from "@/lib/admin-navigation";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface MobileNavProps {
  storeId: string;
  onOpenMenu: () => void;
}

/** Barra inferior del teléfono con “Vender” destacado en el centro. */
export function MobileNav({ storeId, onOpenMenu }: MobileNavProps) {
  const pathname = usePathname() ?? "";
  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-30 flex h-[72px] items-start border-t bg-white px-1 pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      {MOBILE_NAV.map((item) => {
        const Icon = item.icon;
        const active = item.segment !== undefined && isSegmentActive(pathname, storeId, item.segment, item.exact);
        if (item.id === "vender") {
          return (
            <Link
              key={item.id}
              href={dashboardHref(storeId, item.segment!)}
              aria-current={active ? "page" : undefined}
              className="flex flex-1 flex-col items-center gap-1 text-primary"
            >
              <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full border-[3px] border-white bg-kawaii-shell shadow-[0_6px_16px_rgba(254,164,195,0.6)]">
                <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
              </span>
              <span className="text-[11px] font-bold">{item.label}</span>
            </Link>
          );
        }
        const className = cn(
          "flex flex-1 flex-col items-center gap-1 pt-2 text-[11px] font-medium",
          active ? "font-bold text-primary" : "text-muted-foreground",
        );
        if (item.more) {
          return (
            <button key={item.id} type="button" onClick={onOpenMenu} className={className}>
              <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
              {item.label}
            </button>
          );
        }
        return (
          <Link key={item.id} href={dashboardHref(storeId, item.segment!)} aria-current={active ? "page" : undefined} className={className}>
            <Icon className="h-[22px] w-[22px]" aria-hidden="true" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
