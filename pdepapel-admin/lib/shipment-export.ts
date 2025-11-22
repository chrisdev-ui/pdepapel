import { Prisma } from "@prisma/client";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { currencyFormatter } from "./utils";

type ShipmentWithOrder = Prisma.ShippingGetPayload<{
  include: {
    order: {
      select: {
        orderNumber: true;
        fullName: true;
        phone: true;
        address: true;
      };
    };
  };
}>;

export function exportShipmentsToCSV(shipments: ShipmentWithOrder[]): string {
  // CSV Headers
  const headers = [
    "Código de Rastreo",
    "Transportadora",
    "Proveedor",
    "Estado",
    "Costo",
    "Número de Orden",
    "Cliente",
    "Teléfono",
    "Dirección",
    "Fecha Estimada",
    "Fecha de Creación",
  ];

  // Convert data to rows
  const rows = shipments.map((shipment) => {
    const carrierName = shipment.carrierName || shipment.courier || "N/A";
    const costFormatted = shipment.cost
      ? `${currencyFormatter.format(shipment.cost)}`
      : "N/A";
    const estimatedDate = shipment.estimatedDeliveryDate
      ? format(new Date(shipment.estimatedDeliveryDate), "dd/MM/yyyy", {
          locale: es,
        })
      : "N/A";
    const createdDate = format(
      new Date(shipment.createdAt),
      "dd/MM/yyyy HH:mm",
      { locale: es },
    );

    return [
      shipment.trackingCode || "N/A",
      carrierName,
      shipment.provider,
      shipment.status,
      costFormatted,
      shipment.order?.orderNumber || "N/A",
      shipment.order?.fullName || "N/A",
      shipment.order?.phone || "N/A",
      shipment.order?.address || "N/A",
      estimatedDate,
      createdDate,
    ];
  });

  // Combine headers and rows
  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
    ),
  ].join("\n");

  return csvContent;
}

export function downloadCSV(content: string, filename: string) {
  const blob = new Blob(["\ufeff" + content], {
    type: "text/csv;charset=utf-8;",
  });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
