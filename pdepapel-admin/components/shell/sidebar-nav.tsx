"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  FOOTER_ITEMS,
  NAV_GROUPS,
  dashboardHref,
  isSegmentActive,
  type NavBadgeKey,
  type NavItem,
} from "@/lib/admin-navigation";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";

export type NavCounts = Partial<Record<NavBadgeKey, number>>;

interface SidebarNavProps {
  storeId: string;
  counts?: NavCounts;
  /** Solo iconos. */
  collapsed?: boolean;
  onNavigate?: () => void;
}

const badgeClass = (key: NavBadgeKey) =>
  key === "lowStock" ? "bg-tint-cream" : "bg-tint-pink";

function NavBadge({ value, keyName }: { value?: number; keyName: NavBadgeKey }) {
  if (!value) return null;
  return (
    <span
      className={cn(
        "inline-flex h-5 min-w-[20px] items-center justify-center rounded-full px-1.5 text-[11px] font-bold text-primary",
        badgeClass(keyName),
      )}
    >
      {value > 99 ? "99+" : value}
    </span>
  );
}

function ItemLink({
  item,
  storeId,
  pathname,
  search,
  counts,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  storeId: string;
  pathname: string;
  search: string;
  counts?: NavCounts;
  collapsed: boolean;
  onNavigate?: () => void;
}) {
  const hasQueryChildren = !!item.children?.some((child) => child.segment.includes("?"));
  const active =
    isSegmentActive(pathname, storeId, item.segment, item.exact) ||
    !!item.children?.some((child) => isSegmentActive(pathname, storeId, child.segment));
  const [open, setOpen] = useState(active);
  const hasChildren = !!item.children && item.children.length > 0;
  const expanded = hasChildren && (open || active) && !collapsed;
  const Icon = item.icon;
  const badgeValue = item.badge ? counts?.[item.badge] : undefined;

  const link = (
    <Link
      href={dashboardHref(storeId, item.segment)}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={cn(
        "relative flex h-9 items-center gap-2.5 rounded-md text-sm font-medium text-primary transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        collapsed ? "w-10 justify-center px-0" : "flex-1 px-2.5",
        active && "bg-accent font-semibold",
      )}
    >
      <Icon
        className={cn("h-[18px] w-[18px] shrink-0", !active && "text-muted-foreground")}
        aria-hidden="true"
      />
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && item.badge && (
        <NavBadge value={badgeValue} keyName={item.badge} />
      )}
      {collapsed && !!badgeValue && (
        <span
          className={cn(
            "absolute -right-0.5 -top-0.5 h-4 min-w-[16px] rounded-full px-1 text-center text-[10px] font-bold leading-4 text-primary",
            badgeClass(item.badge!),
          )}
        >
          {badgeValue > 99 ? "99+" : badgeValue}
        </span>
      )}
    </Link>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{link}</TooltipTrigger>
        <TooltipContent side="right">{item.label}</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div>
      <div className="flex items-center">
        {link}
        {hasChildren && (
          <button
            type="button"
            aria-label={`${expanded ? "Contraer" : "Expandir"} ${item.label}`}
            aria-expanded={expanded}
            onClick={() => setOpen((value) => !value)}
            className="flex h-9 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-primary"
          >
            <ChevronDown
              className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")}
              aria-hidden="true"
            />
          </button>
        )}
      </div>
      {expanded && (
        <ul className="ml-[22px] mt-0.5 flex flex-col gap-0.5 border-l border-border pl-2">
          {item.children!.map((child) => {
            const childActive = isSegmentActive(pathname, storeId, child.segment, true, hasQueryChildren ? search : undefined);
            return (
              <li key={child.segment}>
                <Link
                  href={dashboardHref(storeId, child.segment)}
                  onClick={onNavigate}
                  aria-current={childActive ? "page" : undefined}
                  className={cn(
                    "flex h-8 items-center rounded-md px-2 text-[13px] text-muted-foreground hover:bg-accent hover:text-primary",
                    childActive && "bg-accent font-semibold text-primary",
                  )}
                >
                  {child.label}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function SidebarNav({ storeId, counts, collapsed = false, onNavigate }: SidebarNavProps) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const search = searchParams?.toString() ? `?${searchParams.toString()}` : "";
  return (
    <TooltipProvider delayDuration={200}>
      <nav
        aria-label="Secciones del panel"
        className={cn("flex flex-1 flex-col gap-1 overflow-y-auto", collapsed ? "items-center px-2 py-2" : "px-3 py-2")}
      >
        {NAV_GROUPS.map((group) => (
          <div key={group.id} className={cn("flex flex-col gap-0.5", collapsed && "items-center")}>
            {group.label &&
              (collapsed ? (
                <span
                  className={cn("my-1.5 h-[3px] w-6 rounded-full", group.tint)}
                  aria-hidden="true"
                />
              ) : (
                <div className="mt-2 flex h-6 items-center gap-2 px-2.5">
                  <span className={cn("h-2 w-2 rounded-full", group.tint)} aria-hidden="true" />
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground">
                    {group.label}
                  </span>
                </div>
              ))}
            {group.items.map((item) => (
              <ItemLink
                key={item.id}
                item={item}
                storeId={storeId}
                pathname={pathname}
                search={search}
                counts={counts}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ))}
      </nav>
      <div className={cn("border-t border-border", collapsed ? "flex justify-center px-2 py-2" : "px-3 py-2")}>
        {FOOTER_ITEMS.map((item) => (
          <ItemLink
            key={item.id}
            item={item}
            storeId={storeId}
            pathname={pathname}
            search={search}
            counts={counts}
            collapsed={collapsed}
            onNavigate={onNavigate}
          />
        ))}
      </div>
    </TooltipProvider>
  );
}
