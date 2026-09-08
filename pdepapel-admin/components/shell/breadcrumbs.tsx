"use client";

import { dashboardHref, groupForSegment, segmentLabel } from "@/lib/admin-navigation";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

interface BreadcrumbsProps {
  storeId: string;
  className?: string;
}

/**
 * Miga de pan a nivel de página (no en la cabecera): Grupo › Sección › Detalle.
 * En el inicio no se muestra.
 */
export function Breadcrumbs({ storeId, className }: BreadcrumbsProps) {
  const pathname = usePathname() ?? "";
  const base = `/${storeId}`;
  if (!pathname.startsWith(base)) return null;
  const segments = pathname.slice(base.length).split("/").filter(Boolean);
  if (segments.length === 0) return null;

  const group = groupForSegment(segments[0]);
  const crumbs: { label: string; href?: string }[] = [];
  if (group?.label && group.label !== segmentLabel(segments[0])) crumbs.push({ label: group.label });
  segments.forEach((segment, index) => {
    const href = dashboardHref(storeId, segments.slice(0, index + 1).join("/"));
    crumbs.push({
      label: segmentLabel(segment),
      href: index < segments.length - 1 ? href : undefined,
    });
  });

  return (
    <nav aria-label="Ruta" className={cn("flex items-center gap-1.5 text-xs font-medium text-muted-foreground", className)}>
      <ol className="flex flex-wrap items-center gap-1.5">
        {crumbs.map((crumb, index) => (
          <li key={`${crumb.label}-${index}`} className="flex items-center gap-1.5">
            {index > 0 && <ChevronRight className="h-3 w-3" aria-hidden="true" />}
            {crumb.href ? (
              <Link href={crumb.href} className="hover:text-primary">
                {crumb.label}
              </Link>
            ) : (
              <span className={cn(index === crumbs.length - 1 && "text-primary")} aria-current={index === crumbs.length - 1 ? "page" : undefined}>
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
