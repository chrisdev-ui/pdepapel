import { ShippingProvider, ShippingStatus } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  verifyStoreOwner: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@clerk/nextjs/server", () => ({ auth: mocks.auth }));
// `lib/utils` valida el entorno al cargarse; la ruta solo necesita `verifyStoreOwner`.
vi.mock("@/lib/utils", () => ({ verifyStoreOwner: mocks.verifyStoreOwner }));
vi.mock("@/lib/prismadb", () => ({ default: { shipping: { findMany: mocks.findMany } } }));

import { GET } from "@/app/api/[storeId]/shipments/export/route";
import { CSV_UTF8_BOM, escapeCsvCell, exportShipmentsToCSV, SHIPMENT_CSV_HEADERS, withUtf8Bom, type ExportableShipment } from "@/lib/shipment-export";

const shipment = (overrides: Partial<ExportableShipment> = {}): ExportableShipment => ({
  trackingCode: "GUIA-1",
  carrierName: "COORDINADORA",
  courier: null,
  provider: ShippingProvider.ENVIOCLICK,
  status: ShippingStatus.InTransit,
  cost: 12500,
  // 04:00Z ya es el 15 en UTC pero aún el 14 de noche en Bogotá.
  estimatedDeliveryDate: new Date("2026-09-15T04:00:00Z"),
  createdAt: new Date("2026-09-12T03:30:00Z"),
  order: { orderNumber: "ORD-1", fullName: "María Pérez", phone: "3001234567", address: "Cra 1 # 2-3" },
  ...overrides,
});

/** Lector CSV mínimo que respeta comillas (y saltos de línea dentro de ellas). */
function parseCsv(csv: string): string[][] {
  const rows: string[][] = [[]];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < csv.length; i += 1) {
    const char = csv[i];
    if (quoted) {
      if (char === '"' && csv[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      rows[rows.length - 1].push(cell);
      cell = "";
    } else if (char === "\n") {
      rows[rows.length - 1].push(cell);
      rows.push([]);
      cell = "";
    } else cell += char;
  }
  rows[rows.length - 1].push(cell);
  return rows;
}

describe("exportShipmentsToCSV", () => {
  it("writes Spanish labels for the guide origin and the status, and dates in Bogotá time", () => {
    const csv = exportShipmentsToCSV([
      shipment(),
      shipment({ provider: ShippingProvider.MANUAL, status: ShippingStatus.Delivered, carrierName: null, courier: "Servientrega" }),
      shipment({ provider: ShippingProvider.NONE, status: ShippingStatus.Preparing, trackingCode: null, cost: null, estimatedDeliveryDate: null, order: null }),
    ]);
    const [header, ...rows] = parseCsv(csv);
    expect(header).toEqual([...SHIPMENT_CSV_HEADERS]);
    expect(header).toContain("Origen de la guía");
    expect(csv).not.toMatch(/ENVIOCLICK|InTransit|MANUAL|NONE/);

    expect(rows[0]).toEqual(["GUIA-1", "COORDINADORA", "EnvioClick", "En tránsito", expect.stringContaining("12.500"), "ORD-1", "María Pérez", "3001234567", "Cra 1 # 2-3", "14/09/2026", "11/09/2026 22:30"]);
    expect(rows[1].slice(1, 4)).toEqual(["Servientrega", "Manual", "Entregado"]);
    expect(rows[2].slice(0, 5)).toEqual(["N/A", "COORDINADORA", "Recoge en tienda", "Preparando", "N/A"]);
    expect(rows[2].slice(5)).toEqual(["N/A", "N/A", "N/A", "N/A", "N/A", "11/09/2026 22:30"]);
  });

  it("escapes commas, quotes and line breaks inside names so the row stays one record", () => {
    const csv = exportShipmentsToCSV([
      shipment({ order: { orderNumber: "ORD-2", fullName: 'Ana "Anita" López, Cali\nBarrio Norte', phone: null, address: null } }),
    ]);
    expect(csv).toContain('"Ana ""Anita"" López, Cali\nBarrio Norte"');
    expect(escapeCsvCell('a,"b"\nc')).toBe('"a,""b""\nc"');
    expect(escapeCsvCell(null)).toBe('""');
    const parsed = parseCsv(csv);
    expect(parsed).toHaveLength(2);
    expect(parsed[1]).toHaveLength(SHIPMENT_CSV_HEADERS.length);
    expect(parsed[1][6]).toBe('Ana "Anita" López, Cali\nBarrio Norte');
  });

  it("prepends the UTF-8 BOM once", () => {
    expect(withUtf8Bom("a,b")).toBe(`${CSV_UTF8_BOM}a,b`);
    expect(withUtf8Bom(withUtf8Bom("a,b"))).toBe(`${CSV_UTF8_BOM}a,b`);
    expect(CSV_UTF8_BOM.charCodeAt(0)).toBe(0xfeff);
  });
});

describe("GET /shipments/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ userId: "user-1" });
    mocks.verifyStoreOwner.mockResolvedValue(undefined);
  });

  it("serves the CSV with the BOM and keeps the content type", async () => {
    mocks.findMany.mockResolvedValue([shipment()]);
    const response = await GET(new Request("https://admin.test/api/store-1/shipments/export"), { params: { storeId: "store-1" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/csv;charset=utf-8;");
    expect(response.headers.get("Content-Disposition")).toMatch(/^attachment; filename="envios-store-1-/);
    // `text()` descarta el BOM al decodificar; los bytes crudos deben empezar por EF BB BF.
    const bytes = new Uint8Array(await response.arrayBuffer());
    expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
    const body = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
    expect(body.charCodeAt(0)).toBe(0xfeff);
    expect(body.slice(1).startsWith(SHIPMENT_CSV_HEADERS.join(","))).toBe(true);
    expect(body).toContain("En tránsito");
    expect(mocks.verifyStoreOwner).toHaveBeenCalledWith("user-1", "store-1");
  });

  it("refuses an anonymous caller before touching the database", async () => {
    mocks.auth.mockResolvedValue({ userId: null });
    const response = await GET(new Request("https://admin.test/api/store-1/shipments/export"), { params: { storeId: "store-1" } });
    expect(response.status).toBe(401);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
