import { Check, ChevronsUpDown, Package } from "lucide-react";
import Image from "next/image";
import { useParams } from "next/navigation";
import * as React from "react";
import useSWR from "swr";
import useSWRInfinite from "swr/infinite";

import { Button } from "@/components/ui/button";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { TintBadge } from "@/components/ui/tint-badge";
import { useDebounce } from "@/hooks/use-debounce";
import { describeVariantBeyondName } from "@/lib/product-variant";
import { cn, currencyFormatter } from "@/lib/utils";
import axios from "axios";

export type AsyncProductOption = {
  id: string;
  name: string;
  sku: string;
  gtin?: string | null;
  stock: number;
  price?: number | null;
  acqPrice?: number | null;
  transportationCost?: number | null;
  brand?: string | null;
  mpn?: string | null;
  hasNoProductIdentifier?: boolean;
  color?: { name: string } | null;
  size?: { name: string } | null;
  design?: { name: string } | null;
  productGroupId?: string | null;
  productGroup?: { id: string; name: string; _count?: { products: number } } | null;
  isArchived?: boolean;
  isKit?: boolean;
  category?: { id?: string; name: string } | null;
  images?: { url: string }[];
};

export interface AsyncProductGroupPick {
  id: string;
  name: string;
  /** Variantes vivas del grupo según la búsqueda. */
  count: number;
}

export interface AsyncProductSelectProps {
  id?: string;
  value: string;
  onChange: (value: string, product?: AsyncProductOption | null) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  /**
   * `true`: siempre en un diálogo (Etiquetas, Ferias). `"auto"`: lista
   * desplegable desde `sm` y diálogo en teléfono (<640 px), donde la lista
   * junto al disparador no cabe. `false` (por defecto): siempre desplegable.
   */
  modal?: boolean | "auto";
  ariaLabel?: string;
  /**
   * Con esto la lista añade, al final de las variantes de un grupo, la fila
   * «todas las variantes»: elegir el grupo entero sin pasar por una variante.
   */
  onSelectGroup?: (group: AsyncProductGroupPick) => void;
  /**
   * Segunda línea del disparador cerrado. `sale` (por defecto): SKU, GTIN,
   * categoría, stock y precio de venta. `cost`, para pedir al proveedor:
   * SKU, stock y costo de compra, que es lo que importa en Aprovisionamiento
   * (el costo solo sale si la respuesta lo trae: la búsqueda y la ficha del
   * dueño sí, la de solo lectura no).
   */
  details?: "sale" | "cost";
}

const fetcher = (url: string) => axios.get(url).then((res) => res.data);

const getProductDetails = (product: AsyncProductOption) =>
  [
    `SKU: ${product.sku}`,
    product.gtin ? `GTIN: ${product.gtin}` : null,
    product.isKit ? "Kit" : null,
    product.category?.name,
    `Stock: ${product.stock}`,
    product.price !== undefined && product.price !== null
      ? currencyFormatter(product.price)
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

const getCostDetails = (product: AsyncProductOption) =>
  [
    `SKU: ${product.sku}`,
    `Stock: ${product.stock}`,
    product.acqPrice !== undefined && product.acqPrice !== null
      ? `Costo: ${currencyFormatter(product.acqPrice)}`
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

/**
 * Fila de la lista: «Nombre · Variante», línea mono «SKU · stock · precio» y
 * su chip. La variante no repite lo que el nombre ya dice («Carpeta … Azul
 * pastel · Azul pastel»).
 */
const getRowTitle = (product: AsyncProductOption) => {
  const variant = describeVariantBeyondName(product);
  return variant ? `${product.name} · ${variant}` : product.name;
};

/** Teléfono: el mismo corte que `SaleSearch` (por debajo de `sm`). */
const PHONE_QUERY = "(max-width: 639px)";

function useIsPhone(enabled: boolean) {
  const [isPhone, setIsPhone] = React.useState(false);
  React.useEffect(() => {
    if (!enabled || typeof window.matchMedia !== "function") return;
    const query = window.matchMedia(PHONE_QUERY);
    const sync = () => setIsPhone(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, [enabled]);
  return enabled && isPhone;
}

const getRowDetails = (product: AsyncProductOption) =>
  [
    product.sku,
    `${product.stock} und`,
    product.price !== undefined && product.price !== null ? currencyFormatter(product.price) : null,
  ]
    .filter(Boolean)
    .join(" · ");

/**
 * El nombre parte en hasta dos líneas (tres en teléfono, donde la lista mide
 * unos 330 px) en vez de cortarse en una: lo que distingue a una variante (el
 * color, el diseño) suele ir al final. El título no lleva `block`:
 * `display: block` anula el `-webkit-box` de `line-clamp`.
 */
const ProductRow = React.memo(function ProductRow({ product, selected }: { product: AsyncProductOption; selected: boolean }) {
  const title = getRowTitle(product);
  return (
    <>
      <Check className={cn("mr-2 mt-2 h-4 w-4 shrink-0 self-start", selected ? "opacity-100" : "opacity-0")} aria-hidden="true" />
      <div className="flex w-full min-w-0 items-start gap-2 overflow-hidden">
        <ProductThumbnail product={product} />
        <div className="min-w-0 flex-1">
          <span className="line-clamp-3 break-words font-medium leading-snug sm:line-clamp-2" title={title}>
            {title}
            {product.isArchived && <span className="ml-2 text-xs text-red-500">(Archivado)</span>}
          </span>
          <span className="block truncate font-mono text-[11px] text-muted-foreground" title={getRowDetails(product)}>
            {getRowDetails(product)}
          </span>
        </div>
        {/* En teléfono el chip «Variante» se comía el nombre; ahí la variante ya se lee en el título. «Kit» no está en el título y se queda. */}
        {product.productGroupId && <TintBadge tone="lavender" label="Variante" className="shrink-0 max-sm:hidden" />}
        {product.isKit && !product.productGroupId && <TintBadge tone="sky" label="Kit" className="shrink-0" />}
      </div>
    </>
  );
});

function GroupRow({ group }: { group: AsyncProductGroupPick }) {
  return (
    <>
      <span className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="flex w-full min-w-0 items-start gap-2 overflow-hidden">
        <div className="flex h-8 w-8 min-w-8 shrink-0 items-center justify-center rounded-md border bg-tint-lavender/40 text-[11px] font-bold text-primary">
          ×{group.count}
        </div>
        <div className="min-w-0 flex-1">
          <span className="line-clamp-3 break-words font-medium leading-snug sm:line-clamp-2">{group.name} · todas las variantes</span>
          <span className="block truncate font-mono text-[11px] text-muted-foreground">
            Una etiqueta por cada variante ({group.count})
          </span>
        </div>
        <TintBadge tone="mint" label="Grupo" className="shrink-0" />
      </div>
    </>
  );
}

function ProductThumbnail({ product }: { product: AsyncProductOption }) {
  const imageUrl = product.images?.[0]?.url;

  return (
    <div className="relative h-8 w-8 min-w-8 shrink-0 overflow-hidden rounded-md border">
      {imageUrl ? (
        <Image
          src={imageUrl}
          alt={product.name}
          fill
          // Miniatura de 32 px: sin `sizes`, Next suponía 100vw y el
          // navegador pedía w_1080/w_1600 por cada fila. Con 32px el loader
          // pide w_128, un ancho que ya existe (CLOUDINARY_DELIVERY_WIDTHS).
          sizes="32px"
          className="object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-muted">
          <Package className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
      )}
    </div>
  );
}

function SelectedProductValue({
  product,
  details: detailsKind = "sale",
}: {
  product: AsyncProductOption;
  details?: "sale" | "cost";
}) {
  const details =
    detailsKind === "cost" ? getCostDetails(product) : getProductDetails(product);
  const title = getRowTitle(product);

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2 text-left">
      <ProductThumbnail product={product} />
      <div className="min-w-0 flex-1">
        <span
          // Hasta tres líneas (cuatro en teléfono): el disparador de una línea de
          // pedido mide 220–350 px y los nombres reales llegan a 69 caracteres
          // más la variante.
          // `whitespace-normal`: el Button trae `whitespace-nowrap` y sin
          // esto el nombre seguía en una sola línea cortada. Sin `block`:
          // `display: block` anula el `-webkit-box` que necesita el recorte.
          className="line-clamp-4 whitespace-normal break-words text-sm font-medium leading-snug sm:line-clamp-3"
          title={title}
        >
          {title}
        </span>
        <span
          className="mt-1 block truncate text-xs text-muted-foreground"
          title={details}
        >
          {details}
        </span>
      </div>
    </div>
  );
}

export function AsyncProductSelect({
  id,
  value,
  onChange,
  disabled,
  placeholder = "Seleccionar producto...",
  className,
  modal = false,
  ariaLabel,
  onSelectGroup,
  details = "sale",
}: AsyncProductSelectProps) {
  const params = useParams();
  const isPhone = useIsPhone(modal === "auto");
  const asDialog = modal === true || isPhone;
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const debouncedQuery = useDebounce(searchQuery, 300);
  const observerTarget = React.useRef<HTMLDivElement>(null);

  // Local state to cache the selected product object for instant display
  // This avoids waiting for SWR or search results to resolve the selected item
  const [cachedSelectedProduct, setCachedSelectedProduct] =
    React.useState<AsyncProductOption | null>(null);

  // Define getKey for useSWRInfinite
  const getKey = (pageIndex: number, previousPageData: any) => {
    // If not open, don't fetch (optional optimization)
    if (!open) return null;

    // If reached end
    if (previousPageData && !previousPageData.metadata.hasMore) return null;

    return `/api/${params.storeId}/products/search?q=${debouncedQuery}&page=${
      pageIndex + 1
    }&limit=20`;
  };

  const { data, size, setSize, isValidating, isLoading } = useSWRInfinite(
    getKey,
    fetcher,
    {
      revalidateFirstPage: false,
    },
  );

  // Flatten pages
  const products: AsyncProductOption[] = React.useMemo(() => (data ? data.flatMap((page) => page.data) : []), [data]);

  // La fila «todas las variantes» va después de la última variante de su
  // grupo que aparezca en la lista, y solo si alguien la quiere escuchar.
  const groupRowAfter = React.useMemo(() => {
    const map = new Map<string, AsyncProductGroupPick>();
    if (!onSelectGroup) return map;
    products.forEach((product: AsyncProductOption) => {
      const group = product.productGroup;
      if (!group?.id) return;
      map.set(product.id, { id: group.id, name: group.name, count: group._count?.products ?? 1 });
    });
    // Un id de producto por grupo: el último que lo menciona.
    const lastByGroup = new Map<string, string>();
    map.forEach((group, productId) => lastByGroup.set(group.id, productId));
    const result = new Map<string, AsyncProductGroupPick>();
    lastByGroup.forEach((productId, groupId) => {
      const group = map.get(productId);
      if (group && group.id === groupId) result.set(productId, group);
    });
    return result;
  }, [onSelectGroup, products]);

  const handleSelectGroup = (group: AsyncProductGroupPick) => {
    onSelectGroup?.(group);
    setOpen(false);
  };

  const renderRows = () =>
    products.map((product: AsyncProductOption) => {
      const group = groupRowAfter.get(product.id);
      return (
        <React.Fragment key={product.id}>
          <CommandItem value={product.id} onSelect={handleSelect}>
            <ProductRow product={product} selected={value === product.id} />
          </CommandItem>
          {group && (
            <CommandItem value={`group:${group.id}`} onSelect={() => handleSelectGroup(group)} data-group-row={group.id}>
              <GroupRow group={group} />
            </CommandItem>
          )}
        </React.Fragment>
      );
    });

  const isLoadingMore =
    isLoading || (size > 0 && data && typeof data[size - 1] === "undefined");
  const isEmpty = data?.[0]?.data?.length === 0;
  const isReachingEnd =
    isEmpty || (data && data[data.length - 1]?.metadata?.hasMore === false);

  // Reset page when query changes
  React.useEffect(() => {
    setSize(1);
  }, [debouncedQuery, setSize]);

  // Infinite Scroll Observer
  React.useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !isReachingEnd && !isLoadingMore) {
          setSize((prev) => prev + 1);
        }
      },
      { threshold: 0.1 },
    );

    const target = observerTarget.current;
    if (target) {
      observer.observe(target);
    }

    return () => {
      if (target) {
        observer.unobserve(target);
      }
    };
  }, [isReachingEnd, isLoadingMore, setSize, open]);

  // Fetch selected product detail if strictly needed (e.g. initial load without search)
  // Check if selected product is already in the loaded list
  const selectedInList = products.find(
    (product: AsyncProductOption) => product.id === value,
  );

  // If we have a cached product that matches the current value, use it to avoid fetching
  const shouldUseCache =
    cachedSelectedProduct && cachedSelectedProduct.id === value;

  const { data: selectedProductDetail } = useSWR(
    value && !selectedInList && !shouldUseCache
      ? `/api/${params.storeId}/products/${value}`
      : null,
    fetcher,
  );

  const selectedProduct =
    (shouldUseCache ? cachedSelectedProduct : null) ||
    selectedInList ||
    selectedProductDetail;

  const handleSelect = (currentValue: string) => {
    const product = products.find(
      (item: AsyncProductOption) => item.id === currentValue,
    );
    // If selecting the already selected one which might be from detail fetch
    const finalProduct =
      product || (currentValue === value ? selectedProduct : null);

    setCachedSelectedProduct(finalProduct); // Cache immediately
    onChange(currentValue, finalProduct);
    setOpen(false);
  };

  if (asDialog) {
    return (
      <>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          onClick={() => setOpen(true)}
          type="button"
          className={cn(
            "h-auto w-full min-w-0 justify-between py-2",
            className,
          )}
        >
          {selectedProduct ? (
            <SelectedProductValue product={selectedProduct} details={details} />
          ) : (
            <span className="min-w-0 flex-1 truncate text-left text-muted-foreground">
              {placeholder}
            </span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
        <CommandDialog
          open={open}
          onOpenChange={setOpen}
          shouldFilter={false}
          title={ariaLabel || placeholder}
          description="Busca y selecciona un producto por nombre, SKU o código."
        >
          <CommandInput
            placeholder="Buscar por nombre, SKU o código..."
            value={searchQuery}
            onValueChange={setSearchQuery}
            // 16 px en teléfono: con menos, iOS acerca la página al enfocar.
            className="text-base sm:text-sm"
          />
          <CommandList className="max-h-[min(560px,60dvh)] w-full overflow-y-auto">
            {!isLoading && products.length === 0 && (
              <CommandEmpty>No se encontraron productos.</CommandEmpty>
            )}

            <CommandGroup>{renderRows()}</CommandGroup>

            {/* Loading / Observer Target */}
            {!isReachingEnd && (
              <div
                ref={observerTarget}
                className="p-4 text-center text-xs text-muted-foreground"
              >
                {isLoadingMore ? "Cargando más..." : "Cargar más"}
              </div>
            )}
          </CommandList>
        </CommandDialog>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          disabled={disabled}
          type="button"
          className={cn(
            "h-auto w-full min-w-0 justify-between py-2",
            className,
          )}
        >
          {selectedProduct ? (
            <SelectedProductValue product={selectedProduct} details={details} />
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      {/*
        La lista ya no copia el ancho del disparador (llegó a abrirse a 34 px):
        mide al menos min(36rem, viewport − 2rem), crece con el disparador y
        nunca se sale de la pantalla (max-w de la base + collisionPadding).
      */}
      <PopoverContent
        className="w-[max(var(--radix-popover-trigger-width),min(36rem,calc(100vw-2rem)))] p-0"
        align="start"
        collisionPadding={16}
        data-product-select-list=""
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Buscar por nombre, SKU o código..."
            value={searchQuery}
            onValueChange={setSearchQuery}
            className="text-base sm:text-sm"
          />
          <CommandList className="max-h-[min(420px,50dvh)] overflow-y-auto">
            {!isLoading && products.length === 0 && (
              <CommandEmpty>No se encontraron productos.</CommandEmpty>
            )}

            <CommandGroup>{renderRows()}</CommandGroup>

            {/* Loading / Observer Target */}
            {!isReachingEnd && (
              <div
                ref={observerTarget}
                className="p-4 text-center text-xs text-muted-foreground"
              >
                {isLoadingMore ? "Cargando más..." : "Cargar más"}
              </div>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
