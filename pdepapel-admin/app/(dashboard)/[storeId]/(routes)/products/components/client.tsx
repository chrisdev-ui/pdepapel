"use client";

import { ProductCatalog } from "@/components/catalog/product-catalog";
import { ApiList } from "@/components/ui/api-list";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { MultiSelect } from "@/components/ui/multi-select";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Separator } from "@/components/ui/separator";
import { Models } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { getErrorMessage } from "@/lib/api-errors";
import { PDFDownloadLink } from "@react-pdf/renderer";
import { format } from "date-fns";
import { Edit, FileDown, Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import React, { useCallback, useState } from "react";
import { ProductColumn, columns } from "./columns";

interface ProductClientProps {
  data: ProductColumn[];
}

const ProductClient: React.FC<ProductClientProps> = ({ data }) => {
  const router = useRouter();
  const params = useParams();
  const { toast } = useToast();
  const [catalogData, setCatalogData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
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

  const distinctGroups = React.useMemo(() => {
    const groups = data
      .map((item) => item.productGroup)
      .filter((g): g is { id: string; name: string } => !!g);

    // Deduplicate
    const unique = new Map();
    groups.forEach((g) => unique.set(g.id, g));
    return Array.from(unique.values());
  }, [data]);

  const groupOptions = React.useMemo(() => {
    return distinctGroups.map((g) => ({
      label: g.name,
      value: g.id,
    }));
  }, [distinctGroups]);

  const filteredData = React.useMemo(() => {
    if (selectedGroups.length === 0) return data;
    return data.filter((item) =>
      item.productGroup?.id
        ? selectedGroups.includes(item.productGroup.id)
        : false,
    );
  }, [data, selectedGroups]);

  return (
    <>
      <div className="flex items-center justify-between">
        <Heading
          title={`Productos (${filteredData.length})`}
          description="Maneja los productos para tu tienda"
        />
        <div className="flex items-center gap-x-2">
          {distinctGroups.length > 0 && (
            <div className="w-[300px]">
              <MultiSelect
                options={groupOptions}
                onValueChange={setSelectedGroups}
                defaultValue={selectedGroups}
                placeholder="Filtrar por grupos"
                variant="inverted"
                maxCount={2}
              />
            </div>
          )}
          <RefreshButton />
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
        data={filteredData}
      />
      <Heading title="API" description="API calls para los productos" />
      <Separator />
      <ApiList entityName={Models.Products} entityIdName="productId" />
    </>
  );
};

export default ProductClient;
