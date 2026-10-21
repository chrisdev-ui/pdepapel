// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BrandedLoader } from "@/components/ui/branded-loader";

/**
 * El cargador flota en el centro de la pantalla sin fondo: antes pintaba un
 * velo difuminado del tamaño de su contenedor y se veía ese recuadro sobre la
 * página. Sirve a todos los loading.tsx del panel y a los Suspense de Inicio
 * y Rendimiento.
 */
describe("BrandedLoader", () => {
  afterEach(() => cleanup());

  it("flota centrado, sin fondo ni desenfoque, y no atrapa clics", () => {
    render(<BrandedLoader />);
    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("Cargando");
    expect(status.className).toMatch(/\bfixed\b/);
    expect(status.className).toMatch(/\binset-0\b/);
    expect(status.className).toMatch(/\bitems-center\b/);
    expect(status.className).toMatch(/\bjustify-center\b/);
    expect(status.className).toMatch(/\bpointer-events-none\b/);
    expect(status.className).not.toMatch(/\bbg-|backdrop-/);
  });
});
