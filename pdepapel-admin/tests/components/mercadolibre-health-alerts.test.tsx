// @vitest-environment jsdom

import { MercadoLibreOperationsCenter } from "@/app/(dashboard)/[storeId]/(routes)/mercadolibre/components/operations-center";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * #8: «Alertas del día» era una lista sin botones; Paula no podía quitar
 * nada y el correo seguía llegando. Ahora cada alerta se marca como revisada
 * (o todas a la vez), y las revisadas se pueden volver a mostrar.
 */
const baseHealth = {
  totalListings: 21,
  activeListings: 20,
  unansweredQuestions: 1,
  shipmentsToDispatch: 0,
  claimsRequiringAttention: 0,
  grossSales: 0,
  netSales: 0,
  marketplaceCosts: 0,
  netProfit: 0,
};
const stock = { kind: "stock_risk", title: "Termo Owala Negro", detail: "Se acabó en la tienda.", alertKey: "stock_risk:l-1", reviewed: false };
const question = { kind: "question", title: "Agenda", detail: "¿Hay rojo?", alertKey: "question:q-1", reviewed: false };

let health: unknown;
const fetchMock = vi.fn();

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "Content-Type": "application/json" } });

beforeEach(() => {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    if (url.endsWith("/health")) return json(health);
    if (url.endsWith("/health/alerts")) return json({ updated: 1, body: init?.body });
    if (url.endsWith("/claims")) return json([]);
    return json([]);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
});

const postedBodies = () =>
  fetchMock.mock.calls
    .filter(([url, init]) => String(url).endsWith("/health/alerts") && (init as RequestInit | undefined)?.method === "POST")
    .map(([, init]) => JSON.parse(String((init as RequestInit).body)));

describe("Alertas del día", () => {
  it("marks one alert as reviewed and reloads", async () => {
    health = { ...baseHealth, issues: [stock, question] };
    render(<MercadoLibreOperationsCenter storeId="store-1" sections={["resumen"]} />);

    const item = (await screen.findByText("Termo Owala Negro:")).closest("li")!;
    fireEvent.click(within(item).getByRole("button", { name: "Marcar como revisada" }));

    await waitFor(() => expect(postedBodies()).toEqual([{ keys: ["stock_risk:l-1"], reviewed: true }]));
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith("/health")).length).toBe(2),
    );
  });

  it("marks all of them as reviewed at once", async () => {
    health = { ...baseHealth, issues: [stock, question] };
    render(<MercadoLibreOperationsCenter storeId="store-1" sections={["resumen"]} />);

    fireEvent.click(await screen.findByRole("button", { name: "Marcar todas como revisadas" }));

    await waitFor(() => expect(postedBodies()).toEqual([{ all: true, reviewed: true }]));
  });

  it("hides reviewed alerts behind a toggle and can show them again", async () => {
    health = { ...baseHealth, issues: [{ ...stock, reviewed: true }] };
    render(<MercadoLibreOperationsCenter storeId="store-1" sections={["resumen"]} />);

    expect(await screen.findByText(/No hay alertas pendientes/)).toBeTruthy();
    expect(screen.queryByText("Termo Owala Negro:")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /1 alerta revisada · Mostrar/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Volver a mostrar" }));

    await waitFor(() => expect(postedBodies()).toEqual([{ keys: ["stock_risk:l-1"], reviewed: false }]));
  });

  it("with a single alert there is no «todas» button", async () => {
    health = { ...baseHealth, issues: [stock] };
    render(<MercadoLibreOperationsCenter storeId="store-1" sections={["resumen"]} />);

    expect(await screen.findByRole("button", { name: "Marcar como revisada" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Marcar todas como revisadas" })).toBeNull();
  });
});
