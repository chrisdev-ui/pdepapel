// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  scanned: { id: "p-scan", name: "Agenda Sanrio", sku: "AGE-1", stock: 3, price: 39000, images: [] } as Record<string, unknown>,
}));

vi.mock("axios", () => ({ default: { post: vi.fn(), patch: vi.fn(), delete: vi.fn(), isAxiosError: () => false } }));
vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1", homeContentId: "nuevo" }), useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), back: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/components/ui/image-upload", () => ({ ImageUpload: () => null }));
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

import { HomeContentForm } from "@/app/(dashboard)/[storeId]/(routes)/portada/[homeContentId]/components/home-content-form";
import type { HomeContentRow } from "@/app/(dashboard)/[storeId]/(routes)/portada/server/get-home-contents";

// Un cargamento: la única portada que muestra «Productos que vienen».
const shipment = {
  id: "h1",
  placement: "CAMPAIGN",
  campaignType: "SHIPMENT",
  eyebrow: null,
  title: "Llega Sanrio",
  subtitle: null,
  primaryLabel: null,
  primaryUrl: null,
  secondaryLabel: null,
  secondaryUrl: null,
  imageUrl: null,
  imageAlt: null,
  isActive: true,
  startsAt: null,
  endsAt: null,
  earlyAccessSentAt: null,
  arrivalSentAt: null,
  createdAt: new Date("2026-09-19T00:00:00.000Z"),
  updatedAt: new Date("2026-09-19T00:00:00.000Z"),
  products: [],
} as unknown as HomeContentRow;

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

/** Portada: cada casilla de «Productos que vienen» tiene su propio escáner. */
describe("Portada · escanear producto del cargamento", () => {
  it("puts the scanned product in the shipment's product list", async () => {
    render(<HomeContentForm initialData={shipment} />);
    expect((await screen.findByLabelText("Producto 1 del cargamento")).textContent).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Escanear producto 1" }));
    expect(screen.getByLabelText("Producto 1 del cargamento").textContent).toBe("p-scan");
    // La lista se compacta: escanear en la casilla 3 con la 2 vacía cae en la 2.
    mocks.scanned = { ...mocks.scanned, id: "p-scan-2" };
    fireEvent.click(screen.getByRole("button", { name: "Escanear producto 3" }));
    expect(screen.getByLabelText("Producto 2 del cargamento").textContent).toBe("p-scan-2");
  });
});
