// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  FairSellGuide,
  fairGuideStorageKey,
} from "@/app/(dashboard)/[storeId]/(routes)/ferias/[fairEventId]/components/fair-sell-guide";

const KEY = fairGuideStorageKey("fair-1");

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("Cómo vender en la feria", () => {
  it("opens on the first visit to a fair, then remembers to stay collapsed", () => {
    render(<FairSellGuide fairEventId="fair-1" paymentProofEnabled />);
    expect(screen.getByRole("heading", { name: "Cómo vender en la feria" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Ocultar/ })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/Registra la venta\./)).toBeInTheDocument();
    expect(screen.getByText(/Adjuntar foto o captura/)).toBeInTheDocument();
    expect(screen.getByText(/Un kit reservado como kit se vende escaneando el kit/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Inventario reservado" })).toHaveAttribute("href", "#inventario-reservado");
    expect(screen.getByRole("link", { name: "manual" })).toHaveAttribute("href", "/manual#ferias-guia");
    expect(window.localStorage.getItem(KEY)).toBe("collapsed");

    cleanup();
    render(<FairSellGuide fairEventId="fair-1" paymentProofEnabled />);
    expect(screen.getByRole("button", { name: /Ayuda/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText(/Registra la venta\./)).toBeNull();
  });

  it("remembers when she reopens it, per fair", () => {
    window.localStorage.setItem(KEY, "collapsed");
    render(<FairSellGuide fairEventId="fair-1" paymentProofEnabled />);
    fireEvent.click(screen.getByRole("button", { name: /Ayuda/ }));
    expect(window.localStorage.getItem(KEY)).toBe("open");
    expect(screen.getByText(/Registra la venta\./)).toBeInTheDocument();
    // Otra feria arranca desde cero.
    expect(window.localStorage.getItem(fairGuideStorageKey("fair-2"))).toBeNull();
  });

  it("does not mention the proof photo when the bucket is not configured", () => {
    render(<FairSellGuide fairEventId="fair-1" paymentProofEnabled={false} />);
    expect(screen.queryByText(/Adjuntar foto o captura/)).toBeNull();
    expect(screen.getByText(/queda en el pedido para cotejar el pago después/)).toBeInTheDocument();
  });
});
