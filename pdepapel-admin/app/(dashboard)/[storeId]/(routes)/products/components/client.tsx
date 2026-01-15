"use client";

import { ProductCatalog } from "@/components/catalog/product-catalog";
import { ProductBatchImportModal } from "@/components/modals/product-batch-import-modal";
import { ApiList } from "@/components/ui/api-list";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Separator } from "@/components/ui/separator";
import { Models } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { Supplier } from "@prisma/client";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { ColumnFiltersState } from "@tanstack/react-table";
import { format } from "date-fns";
import { Edit, FileDown, FileUp, Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import React, { useCallback, useState } from "react";
import { ProductColumn, columns } from "./columns";

interface ProductClientProps {
  data: ProductColumn[];
  suppliers: Supplier[];
}

const ProductClient: React.FC<ProductClientProps> = ({ data, suppliers }) => {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const [catalogData, setCatalogData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);

  const fetchCatalogData = useCallback(async () => {
    try {
      setIsLoading(true);
      const response = await fetch(
        `/api/${params.storeId}/${Models.Products}/catalog`,
      );
      if (!response.ok) {
        throw new Error("Ha ocurrido un error al generar el catálogo");
      }
      const data = await response.json();
      setCatalogData(data);
    } catch (error) {
      console.error(error);
      toast({
        variant: "destructive",
        description: getErrorMessage(error),
      });
    } finally {
      setIsLoading(false);
    }
  }, [params.storeId, toast]);

  const handleCatalogButton = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    await fetchCatalogData();
  };

  // Build group filter options for DataTable
  const groupFilterOptions = React.useMemo(() => {
    const groups = data
      .map((item) => item.productGroup)
      .filter((g): g is { id: string; name: string } => !!g);

    // Deduplicate
    const unique = new Map();
    groups.forEach((g) => unique.set(g.id, g));
    return Array.from(unique.values()).map((g) => ({
      label: g.name,
      value: g.id,
    }));
  }, [data]);

  // Track selected groups from DataTable filter changes
  const handleFiltersChange = useCallback((filters: ColumnFiltersState) => {
    const groupFilter = filters.find((f) => f.id === "productGroupId");
    if (groupFilter && Array.isArray(groupFilter.value)) {
      setSelectedGroups(groupFilter.value as string[]);
    } else {
      setSelectedGroups([]);
    }
  }, []);

  return (
    <>
      <div className="flex items-center justify-between">
        <Heading
          title={`Productos (${data.length})`}
          description="Maneja los productos para tu tienda"
        />
        <div className="flex items-center gap-x-2">
          <RefreshButton />
          <Button variant="outline" onClick={() => setIsImportOpen(true)}>
            <FileUp className="mr-2 h-4 w-4" />
            Importar CSV
          </Button>
          <Button
            variant="outline"
            onClick={handleCatalogButton}
            disabled={isLoading}
          >
            <FileDown className="mr-2 h-4 w-4" />
            {isLoading
              ? "Cargando..."
              : catalogData
                ? "Actualizar catálogo"
                : "Generar catálogo"}
          </Button>
          {catalogData && !isLoading && (
            <PDFDownloadLink
              document={
                <ProductCatalog
                  products={catalogData.products}
                  store={catalogData.store}
                />
              }
              fileName={`Catálogo-${(catalogData.store.name as string)
                .toLowerCase()
                .replace(/\s+/g, "-")}-${format(new Date(), "yyyy-MM-dd")}.pdf`}
            >
              {({ loading: pdfLoading }) => {
                return (
                  <Button variant="default" disabled={pdfLoading}>
                    <FileDown className="mr-2 h-4 w-4" />
                    {pdfLoading ? "Preparando PDF..." : "Descargar PDF"}
                  </Button>
                );
              }}
            </PDFDownloadLink>
          )}
          <Button
            onClick={() =>
              router.push(`/${params.storeId}/${Models.Products}/new-group`)
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Crear grupo
          </Button>
          {selectedGroups.length === 1 && (
            <Button
              onClick={() =>
                router.push(
                  `/${params.storeId}/${Models.Products}/group/${selectedGroups[0]}`,
                )
              }
              variant="secondary"
            >
              <Edit className="mr-2 h-4 w-4" />
              Editar grupo
            </Button>
          )}
          <Button
            onClick={() =>
              router.push(`/${params.storeId}/${Models.Products}/new`)
            }
          >
            <Plus className="mr-2 h-4 w-4" />
            Crear producto
          </Button>
        </div>
      </div>
      <Separator />
      <DataTable
        tableKey={Models.Products}
        searchKey="name"
        columns={columns}
        data={data}
        filters={
          groupFilterOptions.length > 0
            ? [
                {
                  columnKey: "productGroupId",
                  title: "Grupo",
                  options: groupFilterOptions,
                },
              ]
            : undefined
        }
        onColumnFiltersChange={handleFiltersChange}
      />
      <Heading title="API" description="API calls para los productos" />
      <Separator />
      <ApiList entityName={Models.Products} entityIdName="productId" />
      <ProductBatchImportModal
        isOpen={isImportOpen}
        onClose={() => setIsImportOpen(false)}
        suppliers={suppliers}
      />
    </>
  );
};

export default ProductClient;
