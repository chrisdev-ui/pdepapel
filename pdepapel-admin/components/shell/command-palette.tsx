"use client";

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  FOOTER_ITEMS,
  NAV_GROUPS,
  QUICK_ACTIONS,
  dashboardHref,
} from "@/lib/admin-navigation";
import { currencyFormatter } from "@/lib/utils";
import { ArrowRight, Loader2, Tag } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

interface ProductHit {
  id: string;
  name: string;
  sku?: string | null;
  stock?: number;
  price?: number;
}

interface CommandPaletteProps {
  storeId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Permite inyectar la búsqueda en pruebas. */
  searchProducts?: (query: string) => Promise<ProductHit[]>;
}

const defaultSearchProducts =
  (storeId: string) =>
  async (query: string): Promise<ProductHit[]> => {
    const response = await fetch(
      `/api/${storeId}/products?search=${encodeURIComponent(query)}&limit=5&page=1&availability=all`,
      { headers: { Accept: "application/json" } },
    );
    if (!response.ok) return [];
    const payload = (await response.json()) as { products?: ProductHit[] };
    return payload.products ?? [];
  };

/**
 * Barra de comando (⌘ K): acciones, secciones del panel y productos.
 * Cada resultado navega al estado exacto para actuar.
 */
export function CommandPalette({ storeId, open, onOpenChange, searchProducts }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<ProductHit[]>([]);
  const [searching, setSearching] = useState(false);
  const search = useMemo(
    () => searchProducts ?? defaultSearchProducts(storeId),
    [searchProducts, storeId],
  );

  useEffect(() => {
    if (!open) {
      setQuery("");
      setProducts([]);
    }
  }, [open]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setProducts([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const hits = await search(term);
        if (!cancelled) setProducts(hits.slice(0, 5));
      } catch {
        if (!cancelled) setProducts([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, search]);

  const go = (segment: string) => {
    onOpenChange(false);
    router.push(dashboardHref(storeId, segment));
  };

  const destinations = useMemo(() => {
    const items: { label: string; segment: string; group: string }[] = [];
    for (const group of NAV_GROUPS) {
      for (const item of group.items) {
        items.push({ label: item.label, segment: item.segment, group: group.label ?? "Inicio" });
        for (const child of item.children ?? []) {
          if (child.segment !== item.segment) {
            items.push({ label: `${item.label} › ${child.label}`, segment: child.segment, group: group.label ?? "" });
          }
        }
      }
    }
    for (const item of FOOTER_ITEMS) {
      items.push({ label: item.label, segment: item.segment, group: "Ajustes" });
      for (const child of item.children ?? []) {
        if (child.segment !== item.segment) items.push({ label: `${item.label} › ${child.label}`, segment: child.segment, group: "Ajustes" });
      }
    }
    return items;
  }, []);

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Busca o escribe qué quieres hacer…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {searching ? "Buscando…" : "Nada coincide. Prueba con el nombre de una sección, un producto o un SKU."}
        </CommandEmpty>
        <CommandGroup heading="Acciones">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <CommandItem
                key={action.id}
                value={[action.label, ...action.keywords].join(" ")}
                onSelect={() => go(action.segment)}
              >
                <Icon className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <span className="flex min-w-0 flex-col">
                  <span>{action.label}</span>
                  {action.hint && <span className="text-xs text-muted-foreground">{action.hint}</span>}
                </span>
              </CommandItem>
            );
          })}
        </CommandGroup>
        {(products.length > 0 || searching) && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Productos">
              {searching && products.length === 0 && (
                <div className="flex items-center gap-2 px-2 py-1.5 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Buscando productos…
                </div>
              )}
              {products.map((product) => (
                <CommandItem
                  key={product.id}
                  value={`producto ${product.name} ${product.sku ?? ""} ${product.id}`}
                  onSelect={() => go(`productos/${product.id}`)}
                >
                  <Tag className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate">{product.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {[product.sku, product.stock !== undefined ? `stock ${product.stock}` : null, product.price !== undefined ? currencyFormatter(Number(product.price)) : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
        <CommandSeparator />
        <CommandGroup heading="Ir a">
          {destinations.map((destination) => (
            <CommandItem
              key={`${destination.group}-${destination.segment}-${destination.label}`}
              value={`ir a ${destination.label} ${destination.group}`}
              onSelect={() => go(destination.segment)}
            >
              <ArrowRight className="mr-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {destination.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
        <span><kbd className="rounded border bg-white px-1">↑↓</kbd> navegar</span>
        <span><kbd className="rounded border bg-white px-1">↵</kbd> abrir</span>
        <span><kbd className="rounded border bg-white px-1">esc</kbd> cerrar</span>
      </div>
    </CommandDialog>
  );
}
