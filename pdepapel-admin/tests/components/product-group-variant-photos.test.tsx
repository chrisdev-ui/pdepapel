// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  post: vi.fn(),
  patch: vi.fn(),
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
// La galería real necesita Cloudinary; aquí basta con ver qué recibe y poder marcar para quitar.
vi.mock("@/components/ui/image-upload", () => ({
  ImageUpload: ({
    value,
    pendingRemovals = [],
    onMarkRemoval,
    onUndoRemoval,
  }: {
    value: { url: string }[];
    pendingRemovals?: string[];
    onMarkRemoval?: (url: string) => void;
    onUndoRemoval?: (url: string) => void;
  }) => (
    <ul data-testid="fotos-del-grupo">
      {value.map((image) => (
        <li key={image.url}>
          {image.url}
          {pendingRemovals.includes(image.url) ? (
            <button type="button" onClick={() => onUndoRemoval?.(image.url)}>{`Deshacer ${image.url}`}</button>
          ) : (
            <button type="button" onClick={() => onMarkRemoval?.(image.url)}>{`Quitar del grupo ${image.url}`}</button>
          )}
        </li>
      ))}
    </ul>
  ),
}));
vi.mock("axios", () => ({
  default: {
    post: mocks.post,
    patch: mocks.patch,
    delete: vi.fn(),
    get: vi.fn().mockResolvedValue({ data: [] }),
    isAxiosError: (e: unknown) => typeof e === "object" && e !== null && "isAxiosError" in e,
  },
}));

import { ProductGroupForm } from "@/app/(dashboard)/[storeId]/(routes)/productos/components/product-group-form";

const colors = [
  { id: "rojo", name: "Rojo", value: "#f00", storeId: "store-1" },
  { id: "azul", name: "Azul", value: "#00f", storeId: "store-1" },
] as never[];
const design = { id: "flores", name: "Flores", storeId: "store-1" } as never;
const size = { id: "size-1", name: "Único", value: "U", storeId: "store-1" } as never;
const category = { id: "cat-1", name: "Agendas", storeId: "store-1" } as never;

type Foto = { url: string; isMain?: boolean; origin?: "OWN" | "GROUP_COPY" | null };

const variante = (id: string, colorId: string, name: string, images: Foto[] = []) => ({
  id,
  name,
  sku: `SKU-${id}`,
  price: 20000,
  acqPrice: 10000,
  stock: 3,
  isFeatured: false,
  isArchived: false,
  images: images.map((image, index) => ({ id: `${id}-${index}`, isMain: false, origin: "OWN", ...image })),
  categoryId: "cat-1",
  sizeId: "size-1",
  colorId,
  designId: "flores",
  size: { id: "size-1", name: "Único", value: "U" },
  color: { id: colorId, name: colorId, value: "#000" },
  design: { id: "flores", name: "Flores" },
});

/** Como «Bitácora-Agenda William Morris»: fotos del grupo repartidas y una portada propia por variante. */
function renderForm({
  groupImages = [
    { url: "todas.jpg", scope: "all", isMain: true },
    { url: "solo-rojo.jpg", scope: "COMBO|rojo|flores" },
  ] as { url: string; scope: string | null; isMain?: boolean }[],
  products = [
    variante("p-rojo", "rojo", "Agenda Rojo", [
      { url: "portada-rojo.jpg", isMain: true },
      { url: "todas.jpg", origin: "GROUP_COPY" },
      { url: "solo-rojo.jpg", origin: "GROUP_COPY" },
    ]),
    variante("p-azul", "azul", "Agenda Azul", [
      { url: "portada-azul.jpg", isMain: true },
      { url: "todas.jpg", origin: "GROUP_COPY" },
    ]),
  ],
} = {}) {
  render(
    <ProductGroupForm
      categories={[category]}
      sizes={[size]}
      colors={colors}
      designs={[design]}
      suppliers={[]}
      initialData={
        {
          id: "group-1",
          name: "Bitácora",
          storeId: "store-1",
          categoryId: "cat-1",
          images: groupImages.map((image, index) => ({ id: `g${index}`, isMain: false, ...image })),
          products,
        } as never
      }
    />,
  );
}

const save = () => fireEvent.click(screen.getByRole("button", { name: /Guardar grupo/i }));
const sent = () => mocks.patch.mock.calls[0][1] as {
  images: { url: string }[];
  variants: { id: string; images: string[]; coverUrl?: string }[];
};
const variantOf = (id: string) => sent().variants.find((variant) => variant.id === id)!;
const dialog = () => screen.findByRole("alertdialog");

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
  Element.prototype.scrollIntoView = vi.fn();
  mocks.patch.mockResolvedValue({ data: {} });
});
afterEach(cleanup);

describe("fotos del grupo y fotos propias de cada variante, por separado", () => {
  it("«Fotos del grupo» muestra solo las del grupo; las portadas propias van en su sección", () => {
    renderForm();
    const grupo = screen.getByTestId("fotos-del-grupo");
    expect(within(grupo).getAllByRole("button").map((button) => button.textContent)).toEqual([
      "Quitar del grupo todas.jpg",
      "Quitar del grupo solo-rojo.jpg",
    ]);

    const propias = screen.getByRole("region", { name: "Fotos propias de cada variante" });
    expect(within(propias).getByText("Agenda Rojo")).toBeTruthy();
    expect(within(propias).getByText("Agenda Azul")).toBeTruthy();
    expect(within(propias).getAllByText("Portada")).toHaveLength(2);
    expect(within(propias).getAllByTestId("foto-propia")).toHaveLength(2);
  });

  it("quitar una foto propia pide confirmación y el guardado ya no la envía para esa variante", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Quitar de Agenda Rojo" }));
    const confirmar = await dialog();
    expect(within(confirmar).getByText(/Es su portada: pasa a serlo la siguiente foto/)).toBeTruthy();
    fireEvent.click(within(confirmar).getByRole("button", { name: "Quitar de la variante" }));
    expect(await screen.findByText("Se quita al guardar")).toBeTruthy();

    save();
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    expect(variantOf("p-rojo").images).toEqual([]);
    expect(variantOf("p-rojo").coverUrl).toBeUndefined();
    expect(variantOf("p-azul").images).toEqual(["portada-azul.jpg"]);
    expect(sent().images.map((image) => image.url)).toEqual(["todas.jpg", "solo-rojo.jpg"]);
  });

  it("cancelar la confirmación no marca nada", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Quitar de Agenda Azul" }));
    fireEvent.click(within(await dialog()).getByRole("button", { name: "Cancelar" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());

    save();
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    expect(variantOf("p-azul").images).toEqual(["portada-azul.jpg"]);
  });

  it("elegir portada entre las propias viaja como `coverUrl`", async () => {
    renderForm({
      products: [
        variante("p-rojo", "rojo", "Agenda Rojo", [{ url: "uno.jpg", isMain: true }, { url: "dos.jpg" }]),
        variante("p-azul", "azul", "Agenda Azul"),
      ],
    });
    const botones = screen.getAllByRole("button", { name: "Usar como portada de Agenda Rojo" });
    expect(botones).toHaveLength(1);
    fireEvent.click(botones[0]);

    save();
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    expect(variantOf("p-rojo").coverUrl).toBe("dos.jpg");
  });

  it("sin portada propia, la sección dice que la portada es del grupo", () => {
    renderForm({
      products: [
        variante("p-rojo", "rojo", "Agenda Rojo", [{ url: "todas.jpg", origin: "GROUP_COPY", isMain: true }, { url: "propia.jpg" }]),
        variante("p-azul", "azul", "Agenda Azul"),
      ],
    });
    const propias = screen.getByRole("region", { name: "Fotos propias de cada variante" });
    expect(within(propias).getByText("Portada: una foto del grupo")).toBeTruthy();
  });
});

describe("borrar una foto del grupo que una variante también tiene como propia", () => {
  const duplicada = () =>
    renderForm({
      products: [
        variante("p-rojo", "rojo", "Agenda Rojo", [{ url: "portada-rojo.jpg", isMain: true }, { url: "solo-rojo.jpg" }]),
        variante("p-azul", "azul", "Agenda Azul", [{ url: "portada-azul.jpg", isMain: true }]),
      ],
    });

  it("mientras el grupo se la entrega, la foto propia no ofrece papelera", () => {
    duplicada();
    const propias = screen.getByRole("region", { name: "Fotos propias de cada variante" });
    expect(within(propias).getByText("También llega del grupo")).toBeTruthy();
    expect(within(propias).getAllByRole("button", { name: "Quitar de Agenda Rojo" })).toHaveLength(1);
  });

  it("«Sí» la quita del grupo y de las variantes que la tienen", async () => {
    duplicada();
    fireEvent.click(screen.getByRole("button", { name: "Quitar del grupo solo-rojo.jpg" }));
    const pregunta = await dialog();
    expect(within(pregunta).getByText(/También está como foto propia en: «Agenda Rojo»/)).toBeTruthy();
    fireEvent.click(within(pregunta).getByRole("button", { name: "Sí, quitarla también" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());

    save();
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    expect(sent().images.map((image) => image.url)).toEqual(["todas.jpg"]);
    expect(variantOf("p-rojo").images).toEqual(["portada-rojo.jpg"]);
  });

  it("«No» la quita solo del grupo; la variante la conserva", async () => {
    duplicada();
    fireEvent.click(screen.getByRole("button", { name: "Quitar del grupo solo-rojo.jpg" }));
    fireEvent.click(within(await dialog()).getByRole("button", { name: "No, solo del grupo" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());

    save();
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    expect(sent().images.map((image) => image.url)).toEqual(["todas.jpg"]);
    expect(variantOf("p-rojo").images).toEqual(["portada-rojo.jpg", "solo-rojo.jpg"]);
  });

  it("deshacer el borrado del grupo deshace también el de las variantes", async () => {
    duplicada();
    fireEvent.click(screen.getByRole("button", { name: "Quitar del grupo solo-rojo.jpg" }));
    fireEvent.click(within(await dialog()).getByRole("button", { name: "Sí, quitarla también" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Deshacer solo-rojo.jpg" }));

    save();
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    expect(sent().images.map((image) => image.url)).toEqual(["todas.jpg", "solo-rojo.jpg"]);
    expect(variantOf("p-rojo").images).toEqual(["portada-rojo.jpg", "solo-rojo.jpg"]);
  });

  it("una foto del grupo que ninguna variante tiene como propia se quita sin preguntar", async () => {
    duplicada();
    fireEvent.click(screen.getByRole("button", { name: "Quitar del grupo todas.jpg" }));
    expect(await screen.findByRole("button", { name: "Deshacer todas.jpg" })).toBeTruthy();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("una variante que se quedaría sin fotos", () => {
  const sinFotosTrasQuitar = () => {
    renderForm({
      groupImages: [{ url: "solo-azul.jpg", scope: "COMBO|azul|flores", isMain: true }],
      products: [
        variante("p-rojo", "rojo", "Agenda Rojo", [{ url: "portada-rojo.jpg", isMain: true }]),
        variante("p-azul", "azul", "Agenda Azul", [{ url: "solo-azul.jpg", origin: "GROUP_COPY", isMain: true }]),
      ],
    });
  };
  const quitarPortadaRojo = async () => {
    fireEvent.click(screen.getByRole("button", { name: "Quitar de Agenda Rojo" }));
    fireEvent.click(within(await dialog()).getByRole("button", { name: "Quitar de la variante" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  };

  it("avisa antes de guardar y «Volver» no guarda", async () => {
    sinFotosTrasQuitar();
    await quitarPortadaRojo();
    save();
    const aviso = await dialog();
    expect(within(aviso).getByText(/«Agenda Rojo» no tendrá ninguna foto/)).toBeTruthy();
    fireEvent.click(within(aviso).getByRole("button", { name: "Volver" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocks.patch).not.toHaveBeenCalled();
  });

  it("no bloquea: «Guardar igual» guarda", async () => {
    sinFotosTrasQuitar();
    await quitarPortadaRojo();
    save();
    fireEvent.click(within(await dialog()).getByRole("button", { name: "Guardar igual" }));
    await waitFor(() => expect(mocks.patch).toHaveBeenCalledTimes(1));
    expect(variantOf("p-rojo").images).toEqual([]);
  });
});

describe("aviso de fotos sin repartir (#16)", () => {
  const sinRepartir = () =>
    renderForm({
      groupImages: [
        { url: "a.jpg", scope: null, isMain: true },
        { url: "b.jpg", scope: null },
      ],
      products: [variante("p-rojo", "rojo", "Agenda Rojo"), variante("p-azul", "azul", "Agenda Azul")],
    });

  it("se ve desde que se abre el grupo, con el número y «Ir a las fotos»", () => {
    sinRepartir();
    expect(screen.getByText("2 fotos sin repartir")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ir a las fotos" }));
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("tras un guardado frenado dice que no se guardó, arriba y junto al botón, y marca las fotos", async () => {
    sinRepartir();
    save();
    expect(await screen.findByText("No se guardó: faltan 2 fotos por repartir")).toBeTruthy();
    expect(screen.getByText("No se guardó: faltan 2 fotos por repartir.")).toBeTruthy();
    expect(mocks.patch).not.toHaveBeenCalled();
    const tarjetas = document.querySelectorAll("[data-reparto-url]");
    expect(tarjetas).toHaveLength(2);
    tarjetas.forEach((tarjeta) => expect(tarjeta.className).toMatch(/ring-destructive/));
  });

  it("con todo repartido no hay aviso", () => {
    renderForm();
    expect(screen.queryByText(/sin repartir/)).toBeNull();
  });
});

describe("salir con fotos marcadas para quitar", () => {
  it("sin cambios sale sin preguntar", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Volver a productos" }));
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/store-1/productos"));
    expect(screen.queryByText("¿Salir sin guardar?")).toBeNull();
  });

  it("con una foto propia marcada pregunta antes de salir", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Quitar de Agenda Rojo" }));
    fireEvent.click(within(await dialog()).getByRole("button", { name: "Quitar de la variante" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());

    fireEvent.click(screen.getByRole("button", { name: "Volver a productos" }));
    const salir = await dialog();
    expect(within(salir).getByText("¿Salir sin guardar?")).toBeTruthy();
    fireEvent.click(within(salir).getByRole("button", { name: "Seguir editando" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("con una foto del grupo marcada también pregunta", async () => {
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "Quitar del grupo todas.jpg" }));
    await screen.findByRole("button", { name: "Deshacer todas.jpg" });

    fireEvent.click(screen.getByRole("button", { name: "Volver a productos" }));
    expect(within(await dialog()).getByText("¿Salir sin guardar?")).toBeTruthy();
  });
});
