"use client";

import { ProductCatalog } from "@/components/catalog/product-catalog";
import { ProductBatchImportModal } from "@/components/modals/product-batch-import-modal";
import { Button } from "@/components/ui/button";
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
}

const VIEW_PARAM = "vista";
const DEFAULT_VIEW: ProductView = "activos";

const ProductClient: React.FC<ProductClientProps> = ({
  data,
  suppliers,
  taxonomies,
  lowStockThreshold,
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
  const requested = searchParams.get(VIEW_PARAM);
  const [view, setViewState] = useState<ProductView>(
    isProductView(requested) ? requested : DEFAULT_VIEW,
  );

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
    return Array.from(unique.values()).map((g) => ({
      label: g.name,
      value: g.id,
    }));
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
  const rows = useMemo(
    () => data.filter((p) => productMatchesView(p, view, threshold)),
    [data, view, threshold],
  );
  const columns = useMemo(
    () => buildColumns(storeId, threshold),
    [storeId, threshold],
  );

  const setView = (next: ProductView) => {
    setViewState(next);
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
            {counts.activos} activos · {counts["sin-completar"]} sin completar ·{" "}
            {counts["sin-identificador"]} sin identificador ·{" "}
            {counts["imagen-rota"]} con imagen rota · {counts.proximamente}{" "}
            próximamente · {counts["stock-critico"]} con stock crítico ·{" "}
            {counts.agotados} agotados · {counts.archivados} archivados.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <RefreshButton />
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
          const active = item.id === view;
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

      <DataTable
        tableKey={Models.Products}
        searchPlaceholder="Buscar por nombre, SKU o grupo…"
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        onRowClick={(row) => router.push(`/${storeId}/productos/${row.id}`)}
        renderMobileCard={(row) => (
          <ProductMobileCard
            product={row.original}
            storeId={storeId}
            lowStockThreshold={threshold}
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
                    ? "Todos los productos activos están listos para vender."
                    : view === "imagen-rota"
                      ? "Todas las imágenes de los productos activos existen en Cloudinary; el cron diario vuelve a revisarlas."
                      : view === "sin-identificador"
                        ? "Todos los productos activos tienen GTIN o la marca «No tiene identificador global»."
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
