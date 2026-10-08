// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  toast: vi.fn(),
  clearStorage: vi.fn(),
  sanitizeDraft: null as null | ((draft: unknown) => unknown),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1" }),
  useRouter: () => ({ push: mocks.push, refresh: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => <img {...(props as object)} />,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/hooks/use-form-persist", () => ({
  useFormPersist: (options: { sanitizeDraft?: (draft: unknown) => unknown }) => {
    mocks.sanitizeDraft = options.sanitizeDraft ?? null;
    return { clearStorage: mocks.clearStorage };
  },
}));
vi.mock("@/components/ui/image-upload", () => ({ ImageUpload: () => <div data-testid="image-upload" /> }));
vi.mock("@/actions/cleanup-images", () => ({ cleanupImages: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock("axios", () => ({
  default: {
    post: vi.fn(),
    patch: vi.fn(),
    delete: vi.fn(),
    get: vi.fn().mockResolvedValue({ data: [] }),
    isAxiosError: () => false,
  },
}));

import { ProductGroupForm } from "@/app/(dashboard)/[storeId]/(routes)/productos/components/product-group-form";

const color = { id: "color-1", name: "Rosado", value: "#ff00aa", storeId: "store-1" } as never;
const design = { id: "design-1", name: "Kawaii", storeId: "store-1" } as never;
const size = { id: "size-1", name: "Único", value: "U", storeId: "store-1" } as never;
const category = { id: "cat-1", name: "Folders", storeId: "store-1" } as never;

const folder = {
  id: "folder-1",
  name: "Folder tarjetero kawaii",
  category: { id: "cat-1", name: "Folders" },
  size: { id: "size-1", name: "Único", value: "U" },
  color: { id: "color-1", name: "Rosado", value: "#ff00aa" },
  design: { id: "design-1", name: "Kawaii" },
  images: [{ url: "https://res.cloudinary.com/test/image/upload/v1/f1.jpg" }],
  price: 18000,
  acqPrice: 7000,
  stock: 6,
  sku: "FOL-1",
};

class ObservadorVacio {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

const adoptedToasts = () => mocks.toast.mock.calls.filter(([arg]) => arg?.title === "Productos traídos al grupo").length;

function renderForm() {
  render(
    <ProductGroupForm
      categories={[category]}
      sizes={[size]}
      colors={[color]}
      designs={[design]}
      suppliers={[]}
      adoptOnLoad={folder}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.sanitizeDraft = null;
  vi.stubGlobal("IntersectionObserver", ObservadorVacio);
  vi.stubGlobal("ResizeObserver", ObservadorVacio);
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(cleanup);

describe("convertir un producto suelto en grupo", () => {
  it("abre el editor con el producto ya traído y su nombre", async () => {
    renderForm();
    await waitFor(() => expect(adoptedToasts()).toBe(1));
    expect(screen.getAllByDisplayValue("Folder tarjetero kawaii").length).toBeGreaterThan(0);
  });

  it("«Descartar» deja el formulario limpio con el producto traído otra vez", async () => {
    renderForm();
    await waitFor(() => expect(adoptedToasts()).toBe(1));

    fireEvent.click(screen.getByRole("button", { name: "Descartar" }));
    fireEvent.click(await screen.findByRole("button", { name: "Limpiar" }));

    await waitFor(() => expect(mocks.clearStorage).toHaveBeenCalled());
    await waitFor(() => expect(adoptedToasts()).toBe(2));
    expect(screen.getAllByDisplayValue("Folder tarjetero kawaii").length).toBeGreaterThan(0);
  });

  it("al restaurar un borrador no pide volver a traer el producto: se trae solo", async () => {
    renderForm();
    await waitFor(() => expect(mocks.sanitizeDraft).not.toBeNull());
    mocks.sanitizeDraft!({ variants: [{ id: "folder-1", origin: "adopted" }] });
    expect(mocks.toast.mock.calls.some(([arg]) => arg?.title === "Borrador restaurado")).toBe(false);
  });
});
