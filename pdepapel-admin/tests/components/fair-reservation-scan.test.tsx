// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  scanned: { id: "p-scan", name: "Cartuchera Wisdom Rosa", sku: "CAR-AES-ROS-S-L-9090", stock: 3, price: 13000, isKit: false, images: [] } as Record<string, unknown>,
}));

vi.mock("axios", () => ({ default: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), delete: vi.fn(), isAxiosError: () => false } }));
vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1", fairEventId: "f1" }), useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("next/image", () => ({ default: (props: { alt: string }) => <img alt={props.alt} /> }));
vi.mock("@/components/ui/barcode-scanner", () => ({ BarcodeScanner: () => <button type="button">Escanear (venta de feria)</button> }));
vi.mock("@/components/ui/async-product-select", () => ({
  AsyncProductSelect: ({ value, ariaLabel }: { value: string; ariaLabel?: string }) => <output aria-label={ariaLabel}>{value}</output>,
}));
vi.mock("@/components/ui/product-scan-button", () => ({
  ProductScanButton: ({ onFound, label }: { onFound: (p: unknown) => void; label?: string }) => (
    <button type="button" onClick={() => onFound(mocks.scanned)}>
      {label ?? "Escanear"}
    </button>
  ),
}));

import { FairEventWorkspace, type FairEventDetail } from "@/app/(dashboard)/[storeId]/(routes)/ferias/[fairEventId]/components/fair-event-workspace";

const event: FairEventDetail = {
  id: "f1",
  name: "Feria del libro",
  location: null,
  startsAt: null,
  endsAt: null,
  status: "DRAFT",
  notes: null,
  openedAt: null,
  closedAt: null,
  updatedAt: "2026-09-19T00:00:00.000Z",
  inventoryItems: [],
  capsules: [],
  orders: [],
};

afterEach(() => {
  cleanup();
  mocks.toast.mockReset();
});

/**
 * Ferias: el escáner nuevo solo alimenta «Reservar inventario» (producto del
 * catálogo). La venta de feria y la cápsula sorpresa siguen con su propio
 * lector y su propio QR, sin tocar.
 */
describe("Ferias · escanear producto para reservar", () => {
  it("leaves the scanned product pending to reserve, and refuses a kit like the picker does", () => {
    render(<FairEventWorkspace event={event} paymentProofEnabled={false} />);
    const scan = screen.getByRole("button", { name: "Escanear producto para reservar" });
    fireEvent.click(scan);
    expect(screen.getByLabelText("Producto para reservar").textContent).toBe("p-scan");
    // Los kits no se reservan: se reservan sus componentes, igual que al elegirlo de la lista.
    mocks.scanned = { ...mocks.scanned, id: "kit-1", name: "Kit escolar", isKit: true };
    fireEvent.click(scan);
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Reserva los productos físicos del kit", variant: "destructive" }));
    expect(screen.getByLabelText("Producto para reservar").textContent).toBe("p-scan");
    // Ningún escáner nuevo se cuelga de la cápsula: su QR es de la venta.
    expect(screen.queryByRole("button", { name: /cápsula/i })).toBeNull();
  });
});
