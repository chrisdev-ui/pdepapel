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
  useParams: () => ({ storeId: "store-1", categoryId: "cat-1" }),
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh, back: vi.fn() }),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
  default: (props: Record<string, unknown>) => <img {...(props as object)} />,
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("@/hooks/use-form-persist", () => ({ useFormPersist: () => ({ clearStorage: vi.fn() }) }));
vi.mock("@/components/ui/image-upload", () => ({
  ImageUpload: () => <div data-testid="image-upload" />,
}));
vi.mock("axios", () => ({
  default: {
    post: mocks.post,
    patch: mocks.patch,
    delete: mocks.del,
    isAxiosError: (error: unknown) => typeof error === "object" && error !== null && "isAxiosError" in error,
  },
}));

import { CategoryForm } from "@/app/(dashboard)/[storeId]/(routes)/categorias/[categoryId]/components/category-form";

const categoria = {
  id: "cat-1",
  storeId: "store-1",
  name: "Cuadernos",
  slug: "cuadernos",
  typeId: "type-1",
  imageUrl: null,
  seoEnabled: true,
  seoFeatured: false,
  seoTitle: "",
  seoDescription: "",
  seoIntro: "",
  isArchived: false,
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
} as never;

const tipos = [{ id: "type-1", name: "Papelería" }] as never;

function renderForm(coverConfigured = true) {
  render(
    <CategoryForm
      initialData={categoria}
      types={tipos}
      usage={{ productsTotal: 0 } as never}
      coverConfigured={coverConfigured}
    />,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.post.mockResolvedValue({
    data: {
      imageUrl: "https://res.cloudinary.com/demo/portada.png",
      seoIntro: "Una intro propuesta por la IA para la página.",
      seoTitle: "Cuadernos kawaii para tus apuntes",
      seoDescription: "Cuadernos de tapa dura y blanda para clase y trabajo, con envíos a toda Colombia.",
      generated: ["imageUrl", "seoIntro", "seoTitle", "seoDescription"],
    },
  });
});
afterEach(cleanup);

/**
 * El título y la descripción SEO eran los dos únicos campos de la sección sin
 * ayuda de la IA, y son los menos evidentes de escribir: cuánto miden y que
 * la tienda ya le pega «| Papelería P de Papel» detrás al título.
 */
describe("la sección de SEO genera con IA", () => {
  it("un solo botón completa toda la sección en una sola petición", async () => {
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: /Completar sección con IA/i }));

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post).toHaveBeenCalledWith(
      "/api/store-1/categories/cat-1/cover",
      // Sin forzar: completa lo que falte y no vuelve a pagar una portada.
      { part: "all", force: false },
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue("Cuadernos kawaii para tus apuntes")).toBeInTheDocument();
    });
    expect(
      screen.getByDisplayValue(/Cuadernos de tapa dura y blanda para clase y trabajo/),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue("Una intro propuesta por la IA para la página.")).toBeInTheDocument();
  });

  it("el botón del par pide solo los metadatos, y forzando", async () => {
    renderForm();

    // Por su `title`, no por su posición: los tres botones por campo se
    // llaman igual y el orden puede cambiar al mover la sección.
    const delPar = screen
      .getAllByRole("button", { name: /^Generar$/i })
      .find((boton) => /título y otra descripción/i.test(boton.getAttribute("title") ?? ""));
    expect(delPar, "No se encontró el botón del par título + descripción.").toBeDefined();
    fireEvent.click(delPar!);

    await waitFor(() => expect(mocks.post).toHaveBeenCalledTimes(1));
    expect(mocks.post).toHaveBeenCalledWith("/api/store-1/categories/cat-1/cover", {
      part: "seo",
      force: true,
    });
  });

  it("avisa cuando no había nada que completar, en vez de quedarse callado", async () => {
    mocks.post.mockResolvedValue({
      data: { imageUrl: "https://x/y.png", seoIntro: "Ya", seoTitle: "Ya", seoDescription: "Ya", generated: [] },
    });
    renderForm();

    fireEvent.click(screen.getByRole("button", { name: /Completar sección con IA/i }));

    await waitFor(() => expect(mocks.toast).toHaveBeenCalled());
    expect(mocks.toast.mock.calls.at(-1)![0].description).toMatch(/ya estaba completa/i);
  });

  it("sin la IA configurada, los botones no se pueden pulsar", () => {
    renderForm(false);
    expect(screen.getByRole("button", { name: /Completar sección con IA/i })).toBeDisabled();
    for (const boton of screen.getAllByRole("button", { name: /^Generar$/i })) {
      expect(boton).toBeDisabled();
    }
  });
});
