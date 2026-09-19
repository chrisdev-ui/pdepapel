"use client";

import { ProductCatalog } from "@/components/catalog/product-catalog";
import { ProductBatchImportModal } from "@/components/modals/product-batch-import-modal";
import { Button } from "@/components/ui/button";
import { ProductScanButton } from "@/components/ui/product-scan-button";
import { DataTable } from "@/components/ui/data-table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Models } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import {
  PRODUCT_VIEWS,
  isProductView,
  productMatchesView,
  resolveLowStockThreshold,
  type ProductView,
} from "@/lib/product-readiness";
import { cn } from "@/lib/utils";
import { Supplier } from "@prisma/client";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { ColumnFiltersState } from "@tanstack/react-table";
import { format } from "date-fns";
import {
  ChevronDown,
  Edit,
  FileDown,
  FileUp,
  Layers,
  ListChecks,
  Plus,
} from "lucide-react";
import Link from "next/link";
import {
  useParams,
  usePathname,
  useRouter,
  useSearchParams,
} from "next/navigation";
import React, { useCallback, useMemo, useState } from "react";
import { ProductColumn, buildColumns } from "./columns";
import {
  ProductBulkActions,
  type BulkTaxonomies,
} from "./product-bulk-actions";
import { ProductMobileCard } from "./product-mobile-card";

interface ProductClientProps {
  data: ProductColumn[];
  suppliers: Supplier[];
  taxonomies: BulkTaxonomies;
  /** Umbral de stock crítico de la tienda; null usa el de la aplicación. */
  lowStockThreshold: number | null;
  /** URL pública de la tienda, para «Ver en la tienda». */
  storeUrl?: string | null;
}

const VIEW_PARAM = "vista";
const DEFAULT_VIEW: ProductView = "activos";

/** Filtro por atributo que llega desde Atributos («Ver sus productos»): `?color=<id>`, `?tamano=`, `?diseno=`, `?subcategoria=`. */
const ATTRIBUTE_PARAMS = [
  { param: "color", label: "color", pick: (p: ProductColumn) => p.color },
  { param: "tamano", label: "tamaño", pick: (p: ProductColumn) => p.size },
  { param: "diseno", label: "diseño", pick: (p: ProductColumn) => p.design },
  { param: "subcategoria", label: "subcategoría", pick: (p: ProductColumn) => p.category },
] as const;

export function readAttributeFilter(
  searchParams: { get(name: string): string | null },
  data: readonly ProductColumn[],
): { param: string; label: string; name: string; matches: (p: ProductColumn) => boolean } | null {
  for (const entry of ATTRIBUTE_PARAMS) {
    const id = searchParams.get(entry.param);
    if (!id) continue;
    const sample = data.find((p) => entry.pick(p)?.id === id);
    return { param: entry.param, label: entry.label, name: sample ? entry.pick(sample)!.name : "—", matches: (p) => entry.pick(p)?.id === id };
  }
  return null;
}

const ProductClient: React.FC<ProductClientProps> = ({
  data,
  suppliers,
  taxonomies,
  lowStockThreshold,
  storeUrl,
}) => {
  const router = useRouter();
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();
  const params = useParams();
  const storeId = String(params.storeId);
  const { toast } = useToast();
  const [catalogData, setCatalogData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [rowSelection, setRowSelection] = useState<Record<string, boolean>>({});
  // Modo selección en celular: las tarjetas muestran su casilla.
  const [selectMode, setSelectMode] = useState(false);
  // Con texto en el buscador se busca en TODAS las vistas, no solo en la pestaña.
  const [search, setSearch] = useState("");
  const requested = searchParams.get(VIEW_PARAM);
  // La URL manda; el estado local solo cubre el hueco hasta que Next
  // refleja el replaceState.
  const requestedView: ProductView = isProductView(requested)
    ? requested
    : DEFAULT_VIEW;
  const [selected, setSelected] = useState<{
    base: ProductView;
    view: ProductView;
  } | null>(null);
  const view = selected?.base === requestedView ? selected.view : requestedView;

  const fetchCatalogData = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/${storeId}/${Models.Products}/catalog`,
      );
      if (!response.ok)
        throw new Error("Ha ocurrido un error al generar el catálogo");
      setCatalogData(await response.json());
    } catch (error) {
      console.error(error);
      toast({ variant: "destructive", description: getErrorMessage(error) });
    } finally {
      setIsLoading(false);
    }
  }, [storeId, toast]);

  const groupFilterOptions = useMemo(() => {
    const unique = new Map<string, { id: string; name: string }>();
    data.forEach(
      (item) =>
        item.productGroup &&
        unique.set(item.productGroup.id, item.productGroup),
    );
    return Array.from(unique.values())
      .sort((a, b) => a.name.localeCompare(b.name, "es"))
      .map((g) => ({ label: g.name, value: g.id }));
  }, [data]);
  const categoryFilterOptions = useMemo(() => {
    const names = new Set(
      data
        .map((item) => item.category?.name)
        .filter((n): n is string => Boolean(n)),
    );
    return Array.from(names)
      .sort()
      .map((name) => ({ label: name, value: name }));
  }, [data]);

  const handleFiltersChange = useCallback((filters: ColumnFiltersState) => {
    const groupFilter = filters.find((f) => f.id === "productGroupId");
    setSelectedGroups(
      groupFilter && Array.isArray(groupFilter.value)
        ? (groupFilter.value as string[])
        : [],
    );
  }, []);

  const threshold = resolveLowStockThreshold(lowStockThreshold);
  const counts = useMemo(() => {
    const result = {} as Record<ProductView, number>;
    for (const { id } of PRODUCT_VIEWS)
      result[id] = data.filter((p) =>
        productMatchesView(p, id, threshold),
      ).length;
    return result;
  }, [data, threshold]);
  const searching = search.trim().length > 0;
  // Con un atributo en la URL se listan todos sus productos, sin importar la vista.
  const attributeFilter = useMemo(() => readAttributeFilter(searchParams, data), [searchParams, data]);
  const rows = useMemo(() => {
    if (attributeFilter) return data.filter(attributeFilter.matches);
    return searching ? data : data.filter((p) => productMatchesView(p, view, threshold));
  }, [data, view, threshold, searching, attributeFilter]);
  const clearAttributeFilter = () => {
    const query = new URLSearchParams(searchParams.toString());
    ATTRIBUTE_PARAMS.forEach((entry) => query.delete(entry.param));
    const suffix = query.toString();
    router.replace(suffix ? `${pathname}?${suffix}` : pathname);
  };
  const columns = useMemo(
    () => buildColumns(storeId, threshold, storeUrl),
    [storeId, threshold, storeUrl],
  );

  const setView = (next: ProductView) => {
    setSelected({ base: requestedView, view: next });
    const query = new URLSearchParams(searchParams.toString());
    if (next === DEFAULT_VIEW) query.delete(VIEW_PARAM);
    else query.set(VIEW_PARAM, next);
    const suffix = query.toString();
    window.history.replaceState(
      null,
      "",
      suffix ? `${pathname}?${suffix}` : pathname,
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-primary">
            Productos
          </h1>
          <p className="text-sm text-muted-foreground">
            {counts.activos} a la venta · {counts.agotados} agotados ·{" "}
            {counts["stock-critico"]} con stock crítico · {counts.archivados}{" "}
            archivados.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
          <Button
            type="button"
            variant={selectMode ? "secondary" : "outline"}
            className="sm:hidden"
            onClick={() => {
              if (selectMode) setRowSelection({});
              setSelectMode((value) => !value);
            }}
          >
            <ListChecks className="mr-2 h-4 w-4" aria-hidden="true" />
            {selectMode ? "Listo" : "Seleccionar"}
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                Más
                <ChevronDown className="h-4 w-4" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setIsImportOpen(true)}>
                <FileUp className="mr-2 h-4 w-4" aria-hidden="true" />
                Importar CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={fetchCatalogData} disabled={isLoading}>
                <FileDown className="mr-2 h-4 w-4" aria-hidden="true" />
                {isLoading
                  ? "Preparando catálogo…"
                  : catalogData
                    ? "Actualizar catálogo PDF"
                    : "Generar catálogo PDF"}
              </DropdownMenuItem>
              {selectedGroups.length === 1 && (
                <DropdownMenuItem
                  onClick={() =>
                    router.push(
                      `/${storeId}/productos/grupo/${selectedGroups[0]}`,
                    )
                  }
                >
                  <Edit className="mr-2 h-4 w-4" aria-hidden="true" />
                  Editar grupo seleccionado
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          {catalogData && !isLoading && (
            <PDFDownloadLink
              document={
                <ProductCatalog
                  products={catalogData.products}
                  store={catalogData.store}
                />
              }
              fileName={`Catálogo-${(catalogData.store.name as string).toLowerCase().replace(/\s+/g, "-")}-${format(new Date(), "yyyy-MM-dd")}.pdf`}
            >
              {({ loading: pdfLoading }) => (
                <Button variant="secondary" disabled={pdfLoading}>
                  <FileDown className="h-4 w-4" aria-hidden="true" />
                  {pdfLoading ? "Preparando PDF…" : "Descargar catálogo"}
                </Button>
              )}
            </PDFDownloadLink>
          )}
          {/* Escanear abre la ficha (la búsqueda de la tabla filtra en el cliente y cada fila abre la ficha);
              una variante abre su grupo con la variante resaltada; un suelto o un kit, su propia ficha. */}
          <ProductScanButton
            compact
            label="Escanear y abrir"
            notify
            onFound={(product) =>
              router.push(
                product.productGroupId
                  ? `/${storeId}/productos/grupo/${product.productGroupId}?variante=${product.id}`
                  : `/${storeId}/productos/${product.id}`,
              )
            }
          />
          <Button asChild variant="outline">
            <Link href={`/${storeId}/productos/nuevo-grupo`}>
              <Layers className="h-4 w-4" aria-hidden="true" />
              Grupo con variantes
            </Link>
          </Button>
          <Button asChild>
            <Link href={`/${storeId}/productos/nuevo`}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nuevo producto
            </Link>
          </Button>
        </div>
      </div>

      <div
        role="tablist"
        aria-label="Vistas de productos"
        className="flex max-w-full gap-1 overflow-x-auto rounded-full border bg-white p-1"
      >
        {PRODUCT_VIEWS.map((item) => {
          const active = item.id === view && !searching && !attributeFilter;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => setView(item.id)}
              className={cn(
                "flex h-9 shrink-0 items-center gap-2 rounded-full px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-primary hover:bg-accent",
              )}
            >
              {item.label}
              <span
                className={cn(
                  "rounded-full px-1.5 text-xs",
                  active ? "bg-white/20" : "bg-muted",
                )}
              >
                {counts[item.id]}
              </span>
            </button>
          );
        })}
      </div>
      {attributeFilter && (
        <div role="status" className="flex flex-wrap items-center gap-2 rounded-xl border bg-white px-3 py-2 text-sm">
          <span>
            {rows.length === 1 ? "1 producto" : `${rows.length} productos`} con {attributeFilter.label}{" "}
            <span className="font-semibold">«{attributeFilter.name}»</span>, incluidos los archivados.
          </span>
          <Button type="button" variant="ghost" size="sm" onClick={clearAttributeFilter}>
            Quitar filtro
          </Button>
        </div>
      )}
      {searching && !attributeFilter && (
        <p className="text-xs text-muted-foreground" role="status">
          Buscando en todas las vistas, incluidos los archivados. Borra el texto
          para volver a «{PRODUCT_VIEWS.find((v) => v.id === view)?.label}».
        </p>
      )}

      <DataTable
        tableKey={Models.Products}
        searchPlaceholder="Nombre, SKU, GTIN o grupo…"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        onRowClick={(row) => router.push(`/${storeId}/productos/${row.id}`)}
        onGlobalFilterChange={setSearch}
        rowSelection={rowSelection}
        onRowSelectionChange={setRowSelection}
        renderMobileCard={(row) => (
          <ProductMobileCard
            product={row.original}
            storeId={storeId}
            lowStockThreshold={threshold}
            storeUrl={storeUrl}
            selectable={selectMode}
            selected={row.getIsSelected()}
            onSelectedChange={(checked) => row.toggleSelected(checked)}
          />
        )}
        filters={[
          {
            columnKey: "shape",
            title: "Forma",
            options: [
              { label: "Individual", value: "Individual" },
              { label: "Variante", value: "Variante" },
              { label: "Kit", value: "Kit" },
            ],
          },
          ...(categoryFilterOptions.length
            ? [
                {
                  columnKey: "category",
                  title: "Subcategoría",
                  options: categoryFilterOptions,
                },
              ]
            : []),
          ...(groupFilterOptions.length
            ? [
                {
                  columnKey: "productGroupId",
                  title: "Grupo",
                  options: groupFilterOptions,
                },
              ]
            : []),
        ]}
        onColumnFiltersChange={handleFiltersChange}
        bulkActions={(table) => (
          <ProductBulkActions table={table} taxonomies={taxonomies} />
        )}
        emptyState={
          view === "todos" || view === "activos"
            ? {
                title: "Aún no hay productos",
                description: "Crea el primero o importa una hoja CSV.",
                action: (
                  <Button asChild>
                    <Link href={`/${storeId}/productos/nuevo`}>
                      Nuevo producto
                    </Link>
                  </Button>
                ),
              }
            : {
                title: "Nada en esta vista",
                description:
                  view === "sin-completar"
                    ? "Todos los productos a la venta están listos para vender."
                    : view === "imagen-rota"
                      ? "Todas las imágenes de los productos a la venta existen en Cloudinary; el cron diario vuelve a revisarlas."
                      : view === "sin-identificador"
                        ? "Todos los productos a la venta tienen GTIN o la marca «No tiene código de barras»."
                        : view === "en-oferta"
                          ? "Ningún producto tiene una oferta vigente. Las ofertas se crean en Promociones."
                          : "Cuando un producto entre en este estado aparecerá aquí.",
              }
        }
      />
      <ProductBatchImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        suppliers={suppliers}
      />
    </div>
  );
};

export default ProductClient;
