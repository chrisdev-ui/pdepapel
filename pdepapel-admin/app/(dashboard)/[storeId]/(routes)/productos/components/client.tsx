"use client";

import type { SupplierPickerOption } from "@/lib/public-catalog";
import { useCanWrite } from "@/components/shell/viewer-access";
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
  DEFAULT_PRODUCT_VIEW,
  PRODUCT_ATTRIBUTE_PARAMS,
  PRODUCT_LIST_PARAMS,
  type ProductListQuery,
} from "@/lib/product-list-query";
import type { ProductListPage } from "@/lib/product-list";
import {
  PRODUCT_VIEWS,
  resolveLowStockThreshold,
  type ProductView,
} from "@/lib/product-readiness";
import { cn } from "@/lib/utils";
import { Supplier } from "@prisma/client";
import { ColumnFiltersState } from "@tanstack/react-table";
import {
  ChevronDown,
  Edit,
  FileDown,
  FileUp,
  Layers,
  ListChecks,
  Plus,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import {
  useParams,
  usePathname,
  useRouter,
} from "next/navigation";
import React, { useCallback, useMemo, useState, useTransition } from "react";
import { ProductColumn, buildColumns } from "./columns";
import type { BrandOption } from "@/lib/brand-options";
import {
  ProductBulkActions,
  type BulkTaxonomies,
} from "./product-bulk-actions";
import { ProductMobileCard } from "./product-mobile-card";

interface ProductClientProps {
  /** Solo la página actual: la lista se pagina, filtra y busca en el servidor. */
  data: ProductColumn[];
  list: Omit<ProductListPage, "ids"> & {
    query: ProductListQuery;
    /** Nombre del color, tamaño, diseño o subcategoría que llega desde Atributos. */
    attributeName: string | null;
  };
  suppliers: SupplierPickerOption[];
  taxonomies: BulkTaxonomies;
  /** Umbral de stock crítico de la tienda; null usa el de la aplicación. */
  lowStockThreshold: number | null;
  /** URL pública de la tienda, para «Ver en la tienda». */
  storeUrl?: string | null;
  /** Marcas sin archivar, para «Asignar marca». */
  brands?: BrandOption[];
}

const loadCatalogPdfLink = () => import("./catalog-pdf-link");
const CatalogPdfLink = dynamic(loadCatalogPdfLink, {
  ssr: false,
  loading: () => (
    <Button variant="secondary" disabled>
      <FileDown className="h-4 w-4" aria-hidden="true" />
      Preparando PDF…
    </Button>
  ),
});

const ProductClient: React.FC<ProductClientProps> = ({
  data,
  list,
  suppliers,
  taxonomies,
  lowStockThreshold,
  storeUrl,
  brands = [],
}) => {
  const canWrite = useCanWrite();
  const router = useRouter();
  const pathname = usePathname() ?? "";
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
  const [pending, startTransition] = useTransition();
  const { query } = list;
  const view = query.view;
  const searching = query.search.length > 0;
  const attributeFilter = query.attribute ? { ...query.attribute, name: list.attributeName ?? "—" } : null;

  /** Todo vive en la URL: el servidor arma la página con ella, y se puede compartir. */
  const navigate = useCallback(
    (change: (params: URLSearchParams) => void) => {
      // Las acciones en lote solo ven las filas de la página: al cambiar de página o de lista se suelta la selección.
      setRowSelection({});
      const params = new URLSearchParams(window.location.search);
      change(params);
      const suffix = params.toString();
      startTransition(() => router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false }));
    },
    [pathname, router],
  );

  const setPage = useCallback(
    (next: number) =>
      navigate((params) => {
        if (next <= 1) params.delete(PRODUCT_LIST_PARAMS.page);
        else params.set(PRODUCT_LIST_PARAMS.page, String(next));
      }),
    [navigate],
  );

  const setSearch = useCallback(
    (value: string) => {
      const text = value.trim();
      if (text === query.search) return;
      navigate((params) => {
        if (text) params.set(PRODUCT_LIST_PARAMS.search, text);
        else params.delete(PRODUCT_LIST_PARAMS.search);
        params.delete(PRODUCT_LIST_PARAMS.page);
      });
    },
    [navigate, query.search],
  );

  const fetchCatalogData = useCallback(async () => {
    try {
      setIsLoading(true);
      // La librería del PDF baja mientras el servidor arma el catálogo.
      void loadCatalogPdfLink();
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

  const option = ({ value, label }: { value: string; label: string }) => ({ value, label });
  const groupFilterOptions = list.facets.group.map(option);
  const categoryFilterOptions = list.facets.category.map(option);
  const brandFilterOptions = list.facets.brand.map(option);

  const handleFiltersChange = useCallback((filters: ColumnFiltersState) => {
    const groupFilter = filters.find((f) => f.id === "productGroupId");
    setSelectedGroups(
      groupFilter && Array.isArray(groupFilter.value)
        ? (groupFilter.value as string[])
        : [],
    );
  }, []);

  const threshold = resolveLowStockThreshold(lowStockThreshold);
  const { counts, summary } = list;
  const clearAttributeFilter = () =>
    navigate((params) => {
      PRODUCT_ATTRIBUTE_PARAMS.forEach((entry) => params.delete(entry.param));
      params.delete(PRODUCT_LIST_PARAMS.page);
    });
  const columns = useMemo(
    () => buildColumns(storeId, threshold, storeUrl),
    [storeId, threshold, storeUrl],
  );

  const setView = (next: ProductView) =>
    navigate((params) => {
      if (next === DEFAULT_PRODUCT_VIEW) params.delete(PRODUCT_LIST_PARAMS.view);
      else params.set(PRODUCT_LIST_PARAMS.view, next);
      params.delete(PRODUCT_LIST_PARAMS.page);
    });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-primary">
            Productos
          </h1>
          <p className="text-sm text-muted-foreground">
            {summary.activos} a la venta · {summary.agotados} agotados ·{" "}
            {summary["stock-critico"]} con stock crítico · {summary.archivados}{" "}
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
          {catalogData && !isLoading && <CatalogPdfLink catalogData={catalogData} />}
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
          {canWrite && (
          <Button asChild variant="outline">
            <Link href={`/${storeId}/productos/nuevo-grupo`}>
              <Layers className="h-4 w-4" aria-hidden="true" />
              Grupo con variantes
            </Link>
          </Button>
          )}
          {canWrite && (
          <Button asChild>
            <Link href={`/${storeId}/productos/nuevo`}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Nuevo producto
            </Link>
          </Button>
          )}
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
            {list.total === 1 ? "1 producto" : `${list.total} productos`} con {attributeFilter.label}{" "}
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
        data={data}
        isLoading={pending}
        server={{
          page: list.page,
          pageCount: list.pageCount,
          total: list.total,
          pageSize: list.pageSize,
          search: query.search,
          onSearchChange: setSearch,
          onPageChange: setPage,
        }}
        getRowId={(row) => row.id}
        onRowClick={(row) => router.push(`/${storeId}/productos/${row.id}`)}
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
          ...(brandFilterOptions.length
            ? [
                {
                  columnKey: "brand",
                  title: "Marca",
                  options: brandFilterOptions,
                },
              ]
            : []),
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
          <ProductBulkActions table={table} taxonomies={taxonomies} brands={brands} />
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
