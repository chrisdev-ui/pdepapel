"use client";

import { ApiList } from "@/components/ui/api-list";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/ui/data-table";
import { Heading } from "@/components/ui/heading";
import { RefreshButton } from "@/components/ui/refresh-button";
import { Separator } from "@/components/ui/separator";
import { Models } from "@/constants";
import { useToast } from "@/hooks/use-toast";
import { Download } from "lucide-react";
import { useParams } from "next/navigation";
import { useId, useState } from "react";
import { ShipmentColumn, columns } from "./columns";
import { ShipmentFilters } from "./shipment-filters";

interface ShipmentsClientProps {
  data: ShipmentColumn[];
}

const ShipmentsClient: React.FC<ShipmentsClientProps> = ({ data }) => {
  const id = useId();
  const params = useParams();
  const { toast } = useToast();
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    try {
      setExporting(true);
      const response = await fetch(
        `/api/${params.storeId}/${Models.Shipments}/export`,
      );

      if (!response.ok) throw new Error("Error al exportar");

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `envios-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast({
        title: "Exportación exitosa",
        description: "El archivo CSV se ha descargado correctamente",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo exportar los envíos",
        variant: "destructive",
      });
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="flex items-center justify-between">
        <Heading
          title={`Envíos (${data.length})`}
          description="Maneja todos los envíos de tu tienda"
        />
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting || data.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            {exporting ? "Exportando..." : "Exportar CSV"}
          </Button>
          <RefreshButton />
        </div>
      </div>
      <ShipmentFilters />
      <Separator />
      <DataTable
        key={id}
        tableKey={Models.Shipments}
        searchKey="trackingCode"
        columns={columns}
        data={data}
      />
      <Heading title="API" description="API calls para los envíos" />
      <Separator />
      <ApiList entityName={Models.Shipments} entityIdName="shippingId" />
    </>
  );
};

export default ShipmentsClient;
