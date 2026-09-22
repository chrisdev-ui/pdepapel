/* @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import Products from "@/app/(routes)/tienda/components/products";
import type { Product } from "@/types";

vi.mock("@/components/ui/product-card", () => ({
  default: ({ product }: { product: Product }) => <article data-testid="card">{product.name}</article>,
}));
vi.mock("@/app/(routes)/tienda/components/paginator", () => ({
  default: ({ totalPages }: { totalPages: number }) => <nav data-testid="paginador">{totalPages}</nav>,
}));

const page = (prefix: string, n = 24): Product[] =>
  Array.from({ length: n }, (_, index) => ({ id: `${prefix}-${index}`, name: `${prefix} ${index}` }) as unknown as Product);

const cards = () => screen.queryAllByTestId("card").length;
const boton = () => screen.queryByRole("button", { name: /Cargar más|Cargando/ });

afterEach(cleanup);

/**
 * «Cargar más» en el catálogo.
 *
 * Antes destapaba las 12 que faltaban de la página y desaparecía para
 * siempre: con 560 productos en 24 páginas, había que descubrir el paginador
 * numérico para seguir. Quien viene tocando un botón que dice «cargar más»
 * vuelve a tocar donde estaba, y ese era el clic muerto más repetido de
 * `/tienda`. Ahora encadena páginas hasta que no queda nada.
 */
describe("Cargar más", () => {
  it("empieza mostrando 12 y destapa el resto de la página sin pedir nada", async () => {
    const loadPage = vi.fn();
    render(<Products products={page("a")} totalPages={1} currentPage={1} loadPage={loadPage} />);

    expect(cards()).toBe(12);
    expect(boton()).toHaveTextContent("Cargar más (12)");

    fireEvent.click(boton()!);
    await waitFor(() => expect(cards()).toBe(24));
    // Ya estaban en memoria: destaparlas no toca la red.
    expect(loadPage).not.toHaveBeenCalled();
  });

  it("al acabar la página sigue con la siguiente en vez de desaparecer", async () => {
    const loadPage = vi.fn().mockResolvedValue(page("b"));
    render(<Products products={page("a")} totalPages={3} currentPage={1} loadPage={loadPage} />);

    fireEvent.click(boton()!);                       // 12 -> 24 (sin red)
    await waitFor(() => expect(cards()).toBe(24));
    expect(boton()).toBeInTheDocument();             // ya no es un callejón sin salida

    fireEvent.click(boton()!);                       // ahora sí pide la página 2
    await waitFor(() => expect(loadPage).toHaveBeenCalledWith(2));
    await waitFor(() => expect(cards()).toBe(36));   // se destapan de a 12
    expect(screen.getByText("b 0")).toBeInTheDocument();
  });

  it("deja de ofrecerse cuando no queda nada por traer", async () => {
    const loadPage = vi.fn().mockResolvedValue(page("b", 4));
    render(<Products products={page("a")} totalPages={2} currentPage={1} loadPage={loadPage} />);

    fireEvent.click(boton()!);
    await waitFor(() => expect(cards()).toBe(24));
    fireEvent.click(boton()!);
    await waitFor(() => expect(cards()).toBe(28));
    await waitFor(() => expect(boton()).not.toBeInTheDocument());
  });

  /** Ahora sí hay red de por medio: sin señal, se vuelve a tocar. */
  it("mientras trae una página se ve ocupado y no admite otro toque", async () => {
    let resolver: (value: Product[]) => void = () => {};
    const loadPage = vi.fn(() => new Promise<Product[]>((resolve) => { resolver = resolve; }));
    render(<Products products={page("a")} totalPages={3} currentPage={1} loadPage={loadPage} />);

    fireEvent.click(boton()!);
    await waitFor(() => expect(cards()).toBe(24));
    fireEvent.click(boton()!);

    await waitFor(() => expect(boton()).toHaveTextContent("Cargando"));
    expect(boton()).toBeDisabled();
    fireEvent.click(boton()!);                       // un segundo toque no dispara otra petición
    expect(loadPage).toHaveBeenCalledTimes(1);

    await act(async () => { resolver(page("b")); });
    await waitFor(() => expect(boton()).not.toBeDisabled());
  });

  it("si el catálogo no responde lo dice y deja reintentar la misma página", async () => {
    const loadPage = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(page("b"));
    render(<Products products={page("a")} totalPages={3} currentPage={1} loadPage={loadPage} />);

    fireEvent.click(boton()!);
    await waitFor(() => expect(cards()).toBe(24));
    fireEvent.click(boton()!);

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/No se pudieron traer/));
    // No avanzó de página: reintentar pide la 2 otra vez y no se salta productos.
    fireEvent.click(boton()!);
    await waitFor(() => expect(loadPage).toHaveBeenNthCalledWith(2, 2));
    await waitFor(() => expect(cards()).toBe(36));
  });

  it("cambiar de filtros vuelve a empezar por arriba", async () => {
    const loadPage = vi.fn().mockResolvedValue(page("b"));
    const view = render(<Products products={page("a")} totalPages={3} currentPage={1} loadPage={loadPage} />);
    fireEvent.click(boton()!);
    await waitFor(() => expect(cards()).toBe(24));

    view.rerender(<Products products={page("c")} totalPages={3} currentPage={1} loadPage={loadPage} />);
    await waitFor(() => expect(cards()).toBe(12));
    expect(screen.getByText("c 0")).toBeInTheDocument();
  });

  /** El paginador sigue ahí: «Cargar más» no lo reemplaza, lo acompaña. */
  it("no quita el paginador", () => {
    render(<Products products={page("a")} totalPages={24} currentPage={1} loadPage={vi.fn()} />);
    expect(screen.getByTestId("paginador")).toBeInTheDocument();
  });

  it("sin `loadPage` se comporta como antes y no ofrece más al acabar", async () => {
    render(<Products products={page("a")} totalPages={3} currentPage={1} />);
    fireEvent.click(boton()!);
    await waitFor(() => expect(cards()).toBe(24));
    await waitFor(() => expect(boton()).not.toBeInTheDocument());
  });
});
