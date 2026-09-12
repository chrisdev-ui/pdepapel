import type { ShippingProvider, ShippingStatus } from "@prisma/client";
import { formatInTimeZone } from "date-fns-tz";
import { es } from "date-fns/locale";

import { formatValue } from "react-currency-input-field";

import { round2 } from "./order-totals";
import { getShipmentProviderLabel, getShipmentStatusBadge } from "./shipment-views";

const TIME_ZONE = "America/Bogota";

/** Marca de orden de bytes UTF-8: sin ella Excel abre el CSV en Latin-1 y rompe las tildes. */
export const CSV_UTF8_BOM = "\ufeff";

export function withUtf8Bom(content: string): string {
  return content.startsWith(CSV_UTF8_BOM) ? content : CSV_UTF8_BOM + content;
}

/** Campos que usa la exportación; el `findMany` de la ruta los cubre con `include: { order }`. */
export interface ExportableShipment {
  trackingCode: string | null;
  carrierName: string | null;
  courier: string | null;
  provider: ShippingProvider;
  status: ShippingStatus;
  cost: number | null;
  estimatedDeliveryDate: Date | string | null;
  createdAt: Date | string;
  order: {
    orderNumber: string;
    fullName: string;
    phone: string | null;
    address: string | null;
  } | null;
}

export const SHIPMENT_CSV_HEADERS = [
  "Código de rastreo",
  "Transportadora",
  "Origen de la guía",
  "Estado",
  "Costo",
  "Número de pedido",
  "Cliente",
  "Teléfono",
  "Dirección",
  "Fecha estimada",
  "Fecha de creación",
] as const;

const formatDate = (value: Date | string, pattern: string) => formatInTimeZone(new Date(value), TIME_ZONE, pattern, { locale: es });

/** Mismo formato que `currencyFormatter` de `lib/utils`, sin arrastrar la validación de entorno a la exportación. */
const formatCost = (value: number) => formatValue({ value: round2(value).toString(), decimalScale: 0, intlConfig: { locale: "es-CO", currency: "COP" } });

/** Cada celda va entre comillas con las comillas internas dobladas; comas y saltos de línea quedan dentro. */
export function escapeCsvCell(value: string | number | null | undefined): string {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function exportShipmentsToCSV(shipments: ExportableShipment[]): string {
  const rows = shipments.map((shipment) => [
    shipment.trackingCode || "N/A",
    shipment.carrierName || shipment.courier || "N/A",
    getShipmentProviderLabel(shipment.provider),
    getShipmentStatusBadge(shipment.status).label,
    shipment.cost ? formatCost(shipment.cost) : "N/A",
    shipment.order?.orderNumber || "N/A",
    shipment.order?.fullName || "N/A",
    shipment.order?.phone || "N/A",
    shipment.order?.address || "N/A",
    shipment.estimatedDeliveryDate ? formatDate(shipment.estimatedDeliveryDate, "dd/MM/yyyy") : "N/A",
    formatDate(shipment.createdAt, "dd/MM/yyyy HH:mm"),
  ]);

  return [SHIPMENT_CSV_HEADERS.join(","), ...rows.map((row) => row.map(escapeCsvCell).join(","))].join("\n");
}
