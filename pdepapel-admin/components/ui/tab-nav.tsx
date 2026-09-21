import Link from "next/link";

import { cn } from "@/lib/utils";

export interface TabNavItem {
  id: string;
  label: string;
  href: string;
}

interface TabNavProps {
  items: TabNavItem[];
  activeId: string;
  /** Qué agrupa esta barra: «Vistas de rendimiento», «Tipos de promoción». */
  label: string;
  className?: string;
}

/**
 * Barra de vistas que son enlaces de verdad.
 *
 * Varias pantallas escribían a mano `<nav role="tablist">` con
 * `<Link role="tab">`. Eso promete el patrón de pestañas de ARIA —cada pestaña
 * gobierna un `tabpanel`, se recorren con las flechas, el foco se mueve solo—
 * y aquí no hay nada de eso: son enlaces que cambian de página. Un lector de
 * pantalla anunciaba «pestaña 2 de 3» y luego no encontraba el panel.
 *
 * Se anuncian como lo que son: navegación, con `aria-current="page"` en la
 * activa. Y envuelven en vez de desplazarse, porque a 390 la tercera quedaba
 * fuera de la vista sin ninguna señal de que estuviera ahí.
 */
export function TabNav({ items, activeId, label, className }: TabNavProps) {
  return (
    <nav
      aria-label={label}
      className={cn(
        "flex max-w-full flex-wrap gap-1 self-start rounded-2xl border bg-white p-1 sm:rounded-full",
        className,
      )}
    >
      {items.map((item) => {
        const isActive = item.id === activeId;
        return (
          <Link
            key={item.id}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex min-h-11 shrink-0 items-center rounded-full px-3.5 text-sm font-semibold transition-colors sm:min-h-0 sm:h-9",
              isActive
                ? "bg-primary text-primary-foreground"
                : "text-primary hover:bg-accent",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
