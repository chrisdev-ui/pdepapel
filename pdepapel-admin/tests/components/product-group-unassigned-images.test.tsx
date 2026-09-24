// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  patch: vi.fn(),
  del: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1" }),
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => <img {...(props as object)} />,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/hooks/use-form-persist", () => ({ useFormPersist: () => ({ clearStorage: vi.fn() }) }));
vi.mock("@/components/ui/image-upload", () => ({ ImageUpload: () => <div data-testid="image-upload" /> }));
vi.mock("axios", () => ({
  default: {
    post: mocks.post,
    patch: mocks.patch,
    delete: mocks.del,
    get: vi.fn().mockResolvedValue({ data: [] }),
    isAxiosError: (e: unknown) => typeof e === "object" && e !== null && "isAxiosError" in e,
  },
}));

import { ProductGroupForm } from "@/app/(dashboard)/[storeId]/(routes)/productos/components/product-group-form";

const color = { id: "color-1", name: "Lila", value: "#C8A2C8", storeId: "store-1" } as never;
const color2 = { id: "color-2", name: "Menta", value: "#98FF98", storeId: "store-1" } as never;
const design = { id: "design-1", name: "Gatito", storeId: "store-1" } as never;
const size = { id: "size-1", name: "Único", value: "U", storeId: "store-1" } as never;
const category = { id: "cat-1", name: "Cartucheras", storeId: "store-1" } as never;

/**
 * Una variante tal como la manda el servidor: los ids van planos
 * (`colorId`, `sizeId`…) porque de ahí saca el formulario sus valores por
 * defecto, y anidados porque la tabla los enseña así.
 */
const variante = (id: string, colorId: string) => ({
  id,
  name: `Cartuchera ${colorId}`,
  sku: `SKU-${id}`,
  price: 20000,
  acqPrice: 10000,
  stock: 3,
  isFeatured: false,
  isArchived: false,
  images: [] as { id: string; url: string; isMain: boolean }[],
  categoryId: "cat-1",
  sizeId: "size-1",
  colorId,
  designId: "design-1",
  size: { id: "size-1", name: "Único", value: "U" },
  color: { id: colorId, name: "X", value: "#000000" },
  design: { id: "design-1", name: "Gatito" },
});

function grupo(
  imageMapping: { url: string; scope: string }[],
  productos = [variante("p1", "color-1"), variante("p2", "color-2")],
) {
  return {
    id: "group-1",
    name: "Cartuchera kawaii",
    storeId: "store-1",
    categoryId: "cat-1",
    images: [{ id: "i1", url: "a.jpg" }, { id: "i2", url: "b.jpg" }],
    imageMapping,
    products: productos,
  } as never;
}

function renderForm(
  imageMapping: { url: string; scope: string }[],
  productos?: ReturnType<typeof variante>[],
) {
  render(
    <ProductGroupForm
      categories={[category]}
      sizes={[size]}
      colors={[color, color2]}
      designs={[design]}
      suppliers={[]}
      initialData={grupo(imageMapping, productos)}
    />,
  );
}

/** jsdom no los trae y el formulario los usa para cargar listas al hacer scroll. */
class ObservadorVacio {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("IntersectionObserver", ObservadorVacio);
  vi.stubGlobal("ResizeObserver", ObservadorVacio);
  // `scrollIntoView` no existe en jsdom; el freno lo llama al frenar.
  Element.prototype.scrollIntoView = vi.fn();
  mocks.patch.mockResolvedValue({ data: {} });
  mocks.post.mockResolvedValue({ data: {} });
});
afterEach(cleanup);

describe("guardar un grupo con fotos sin repartir", () => {
  it("se frena y no llama a la API", async () => {
    renderForm([]);
    fireEvent.click(screen.getByRole("button", { name: /Guardar grupo/i }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    expect(mocks.patch).not.toHaveBeenCalled();
    expect(mocks.post).not.toHaveBeenCalled();
    const aviso = mocks.toast.mock.calls.at(-1)![0];
    expect(aviso.title).toMatch(/Faltan fotos por repartir/i);
    expect(aviso.variant).toBe("destructive");
  });

  it("con el reparto hecho sí guarda", async () => {
    renderForm([
      { url: "a.jpg", scope: "all" },
      { url: "b.jpg", scope: "color-1" },
    ]);
    fireEvent.click(screen.getByRole("button", { name: /Guardar grupo/i }));

    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
  });

  /**
   * Con una sola variante no hay reparto que hacer: preguntar por él sería
   * estorbar. El freno solo existe cuando hay a quién repartirle.
   */
  it("un grupo de una sola variante guarda aunque no se haya repartido nada", async () => {
    renderForm([], [variante("p1", "color-1")]);
    fireEvent.click(screen.getByRole("button", { name: /Guardar grupo/i }));

    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    expect(mocks.toast.mock.calls.map((c) => c[0]?.title).join(" ")).not.toMatch(
      /Faltan fotos/i,
    );
  });

  /**
   * La portada de una variante con fotos propias sobrevive al guardado.
   *
   * `getAllImages()` armaba el mapa de fotos del formulario marcando como «no
   * portada» toda foto que solo viviera en una variante, sin mirar lo
   * guardado. Con eso, abrir el grupo ya borraba la portada de esa variante y
   * el guardado la escribía perdida. Se comprueba por el payload porque
   * `getAllImages` es un cierre privado del componente.
   */
  it("la portada de una foto propia de la variante llega al guardado", async () => {
    const conPortada = {
      ...variante("p1", "color-1"),
      images: [{ id: "iv", url: "propia.jpg", isMain: true }],
    };
    renderForm(
      [
        { url: "a.jpg", scope: "all" },
        { url: "b.jpg", scope: "color-1" },
        { url: "propia.jpg", scope: "color-1" },
      ],
      [conPortada, variante("p2", "color-2")],
    );

    fireEvent.click(screen.getByRole("button", { name: /Guardar grupo/i }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));

    const enviadas = mocks.patch.mock.calls[0][1].images as {
      url: string;
      isMain?: boolean;
    }[];
    const propia = enviadas.find((i) => i.url === "propia.jpg");
    expect(propia, "la foto propia de la variante no llegó al guardado").toBeDefined();
    expect(propia!.isMain).toBe(true);
  });
});
