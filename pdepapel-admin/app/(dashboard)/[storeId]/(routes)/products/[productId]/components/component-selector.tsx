"use client";

import { useDebounce } from "@/hooks/use-debounce";
import axios from "axios";
import {
  ChevronsUpDown,
  Loader2,
  Package,
  Plus,
  Search,
  X,
} from "lucide-react";
import Image from "next/image";
import { useParams } from "next/navigation";
import * as React from "react";
import { useCallback } from "react";
import useSWRInfinite from "swr/infinite";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { QuantitySelector } from "@/components/ui/quantity-selector";
import { cn, currencyFormatter } from "@/lib/utils";

// Interface matched to API response
interface ProductForItem {
  id: string;
  name: string;
  price: number;
  stock: number;
  images: { url: string }[];
  category?: { name: string };
  size?: { name: string };
  color?: { name: string; value: string };
  discountedPrice?: number;
  hasDiscount?: boolean;
  sku?: string;
  productGroup?: { name: string };
  design?: string | { name: string };
}

interface KitComponent {
  componentId: string;
  quantity: number;
  name?: string;
  sku?: string;
  image?: string;
  stock?: number;
  price?: number; // Added to track component price
  // Additional details for display
  categoryName?: string;
  colorName?: string;
  sizeName?: string;
  designName?: string;
}

interface ComponentSelectorProps {
  value: KitComponent[];
  onChange: (value: KitComponent[]) => void;
  disabled?: boolean;
}

const fetcher = (url: string) => axios.get(url).then((res) => res.data);

export const ComponentSelector: React.FC<ComponentSelectorProps> = ({
  value,
  onChange,
  disabled,
}) => {
  const params = useParams();
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const debouncedSearch = useDebounce(searchQuery, 300);

  // Reset search when dialog closes
  React.useEffect(() => {
    if (!open) {
      setSearchQuery("");
    }
  }, [open]);

  // Parse existing value to map for easy checking
  const selectedIds = React.useMemo(
    () => new Set(value.map((v) => v.componentId)),
    [value],
  );

  // Infinite Scroll Logic
  const getKey = (pageIndex: number, previousPageData: any) => {
    if (!open) return null; // Don't fetch if closed
    if (previousPageData && !previousPageData.products?.length) return null; // reached the end
    // Page is 1-based in API
    // fromShop=true enables efficient DB pagination
    // excludeProducts excludes ALREADY selected items if we wanted, but we'll filter client side to avoid layout shifts or complex queries,
    // OR just show them as "Selected".
    // Let's keep it simple: fetch all, and mark selected visually.
    return `/api/${params.storeId}/products/selectable?search=${debouncedSearch}&limit=20&page=${pageIndex + 1}&v=2`;
  };

  const { data, size, setSize, isLoading, isValidating } = useSWRInfinite(
    getKey,
    fetcher,
    {
      revalidateFirstPage: false,
      persistSize: false,
    },
  );

  const productsData = React.useMemo(() => {
    return Array.isArray(data)
      ? data.flatMap((page) =>
          page && Array.isArray(page.products) ? page.products : [],
        )
      : [];
  }, [data]);

  const isEmpty = data?.[0]?.products?.length === 0;
  const isReachingEnd =
    isEmpty || (data && data[data.length - 1]?.products?.length < 20);

  // Combine Selected + API Results is not needed here because we are NOT
  // "Prioritizing selected" in the picker. The picker is just to find NEW things.
  // The selected items are shown in the main form list.
  // BUT, we should probably exclude items that are already in the kit?
  // Or just show them as "Added"?
  // Let's filter visually.

  // Load More Handler (Infinite Scroll via Scroll Event)
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const handleScroll = useCallback(() => {
    if (scrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
      if (
        scrollTop + clientHeight >= scrollHeight - 200 && // Load when near bottom
        !isReachingEnd &&
        !isValidating
      ) {
        setSize(size + 1);
      }
    }
  }, [isReachingEnd, isValidating, setSize, size]);

  const onAdd = (product: ProductForItem) => {
    const defaultQty = 1;

    // Resolve design name safely
    let designName = "";
    if (typeof product.design === "string") {
      designName = product.design;
    } else if (product.design?.name) {
      designName = product.design.name;
    }

    const newItem: KitComponent = {
      componentId: product.id,
      quantity: defaultQty,
      name: product.name,
      sku: product.sku,
      image: product.images?.[0]?.url,
      stock: product.stock,
      price: product.price, // Populate price
      categoryName: product.category?.name,
      colorName: product.color?.name,
      sizeName: product.size?.name,
      designName: designName,
    };
    onChange([...value, newItem]);
    // Allow adding multiple, so don't close dialog
    // setOpen(false);
  };

  const onRemove = (id: string) => {
    onChange(value.filter((item) => item.componentId !== id));
  };

  const onUpdateQuantity = (id: string, qty: number) => {
    if (qty < 1) return;
    onChange(
      value.map((item) =>
        item.componentId === id ? { ...item, quantity: qty } : item,
      ),
    );
  };

  return (
    <div className="space-y-6">
      {/* Trigger Button (Combobox Style) */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className="w-full justify-between"
          >
            <span>Agregar productos al kit...</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </DialogTrigger>
        {/* Maximized Dialog */}
        <DialogContent className="max-w-[95vw] gap-0 p-0 lg:max-w-7xl">
          <DialogTitle className="sr-only">
            Buscar productos para el kit
          </DialogTitle>
          <div className="flex items-center justify-between border-b px-4 py-2">
            <div className="flex flex-1 items-center gap-2">
              <Search className="h-5 w-5 text-muted-foreground" />
              <input
                className="flex h-12 w-full bg-transparent text-lg outline-none placeholder:text-muted-foreground"
                placeholder="Buscar productos..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                  }
                }}
              />
            </div>
          </div>

          <div
            className="max-h-[80vh] overflow-y-auto p-6"
            ref={scrollRef}
            onScroll={handleScroll}
          >
            {isLoading && productsData.length === 0 && (
              <div className="flex h-40 items-center justify-center">
                <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
              </div>
            )}

            {!isLoading && productsData.length === 0 && (
              <div className="flex h-60 flex-col items-center justify-center text-muted-foreground">
                <Search className="mb-4 h-12 w-12 opacity-20" />
                <p className="text-lg">No se encontraron productos.</p>
              </div>
            )}

            {/* Grid Layout: Max 4 columns */}
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 md:grid-cols-3 lg:grid-cols-4">
              {productsData.map((product) => {
                const isSelected = selectedIds.has(product.id);
                // Also check if it's a kit itself?? A kit inside a kit?
                // Probably avoid that for now to prevent recursion loops, or backend handles it.
                // But the prompt said "products", usually means base products.
                // API allows filtering kits? We didn't add that filter yet.

                return (
                  <div
                    key={product.id}
                    className={cn(
                      "group relative flex flex-col overflow-hidden rounded-xl border bg-card transition-all hover:shadow-lg",
                      isSelected &&
                        "opacity-50 ring-2 ring-primary ring-offset-2",
                    )}
                  >
                    {/* Image Area */}
                    <div className="relative aspect-square w-full overflow-hidden bg-muted">
                      <Image
                        fill
                        src={product.images?.[0]?.url || "/placeholder.png"}
                        alt={product.name}
                        className="object-cover transition-transform duration-500 group-hover:scale-105"
                      />
                      {product.hasDiscount && (
                        <Badge
                          variant="destructive"
                          className="absolute right-2 top-2 shadow-sm"
                        >
                          Oferta
                        </Badge>
                      )}
                      {isSelected && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-[1px]">
                          <span className="font-bold text-white">Agregado</span>
                        </div>
                      )}
                    </div>

                    {/* Content Area */}
                    <div className="flex flex-1 flex-col p-4">
                      <div className="mb-2">
                        <h3 className="line-clamp-2 text-base font-semibold leading-snug">
                          {product.name}
                        </h3>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          {product.category?.name && (
                            <span>{product.category.name}</span>
                          )}
                          {product.category?.name && product.design && (
                            <span>•</span>
                          )}

                          {product.design && (
                            <span>
                              {typeof product.design === "string"
                                ? product.design
                                : product.design?.name}
                            </span>
                          )}

                          {(product.design || product.category?.name) &&
                            product.color && <span>•</span>}

                          {product.color && product.color.value && (
                            <div
                              className="flex items-center gap-1"
                              title={product.color.name}
                            >
                              <div
                                className="h-3 w-3 rounded-full border shadow-sm"
                                style={{ backgroundColor: product.color.value }}
                              />
                              <span>{product.color.name}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-auto pt-2">
                        <div className="mb-3 flex flex-wrap items-baseline gap-2">
                          <span className="text-lg font-bold">
                            {currencyFormatter(
                              product.discountedPrice || product.price,
                            )}
                          </span>
                        </div>

                        {/* Controls */}
                        {isSelected ? (
                          <Button
                            className="w-full"
                            variant="secondary"
                            disabled
                          >
                            Agregado
                          </Button>
                        ) : (
                          <Button
                            className="w-full"
                            onClick={() => onAdd(product)}
                            disabled={disabled}
                          >
                            <Plus className="mr-2 h-4 w-4" />
                            Agregar
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Loading More Spinner */}
            {(isValidating || isLoading) && productsData.length > 0 && (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Selected Components List (AdminCartItem Style) */}
      <div className="flex flex-col gap-4">
        {value.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-md border border-dashed p-8 text-center animate-in fade-in-50">
            <Package className="mb-4 h-10 w-10 text-muted-foreground opacity-50" />
            <h3 className="text-lg font-semibold text-foreground">Kit Vacío</h3>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Usa el botón &quot;Agregar productos&quot; para componer este kit.
            </p>
          </div>
        ) : (
          value.map((item) => (
            <div
              key={item.componentId}
              className="flex items-start rounded-lg border bg-card p-4 shadow-sm transition-all hover:shadow-md"
            >
              {/* Image */}
              <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-muted sm:h-20 sm:w-20">
                {item.image ? (
                  <Image
                    fill
                    src={item.image}
                    alt={item.name || "Product"}
                    className="object-cover object-center"
                  />
                ) : (
                  <Package className="m-auto mt-4 h-8 w-8 text-muted-foreground opacity-50" />
                )}
              </div>

              {/* Content */}
              <div className="ml-4 flex min-h-[5rem] flex-1 flex-col justify-between sm:ml-6">
                <div className="relative pr-9 sm:grid sm:grid-cols-2 sm:gap-x-6 sm:pr-0">
                  <div className="flex flex-col justify-between">
                    <h3 className="text-sm font-medium text-foreground">
                      {item.name || "Producto sin nombre"}
                    </h3>
                    <p className="mt-1 font-mono text-xs text-muted-foreground">
                      SKU: {item.sku || "N/A"}
                    </p>
                  </div>

                  <div className="mt-1 flex flex-wrap gap-y-1 text-xs text-muted-foreground sm:mt-0 sm:justify-end sm:text-right">
                    {item.categoryName && (
                      <span className="mr-3">{item.categoryName}</span>
                    )}
                    {item.sizeName && (
                      <span className="mr-3 border-l border-border pl-3">
                        {item.sizeName}
                      </span>
                    )}
                    {item.colorName && (
                      <span className="border-l border-border pl-3">
                        {item.colorName}
                      </span>
                    )}
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col">
                      <label className="mb-1 text-[10px] font-bold uppercase text-muted-foreground">
                        Cantidad Requerida
                      </label>
                      <QuantitySelector
                        value={item.quantity}
                        onChange={(val) =>
                          onUpdateQuantity(item.componentId, val)
                        }
                        className="h-8 w-28"
                        min={1}
                      />
                    </div>
                    <div className="ml-2 mt-4 text-xs text-muted-foreground">
                      Stock Actual:{" "}
                      <span
                        className={
                          item.stock && item.stock < item.quantity
                            ? "font-medium text-destructive"
                            : "text-foreground"
                        }
                      >
                        {item.stock ?? 0}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Remove Button */}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => onRemove(item.componentId)}
                type="button"
                className="-mr-2 -mt-2 text-muted-foreground hover:text-destructive"
                disabled={disabled}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          ))
        )}
      </div>
      <div className="text-center text-xs text-muted-foreground">
        * El stock del Kit se calculará en base al componente con menor
        disponibilidad proporcional.
      </div>
    </div>
  );
};
