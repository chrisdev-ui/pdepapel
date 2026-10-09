// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MercadoLibreProfilesPanel } from "@/app/(dashboard)/[storeId]/(routes)/configuracion/components/mercadolibre-profiles-panel";

const profiles = [
  {
    id: "p1",
    name: "Cartucheras",
    categoryId: "MCO441855",
    origin: "LEARNED",
    state: "SUGGESTED",
    stockSafetyBuffer: 0,
    candidates: [
      { categoryId: "MCO441855", categoryName: "Cartucheras", uses: 3, lastUsedAt: "2026-10-09T00:00:00Z" },
      { categoryId: "MCO999", categoryName: "Estuches", uses: 1, lastUsedAt: "2026-10-01T00:00:00Z" },
    ],
    localCategory: { id: "c1", name: "Cartucheras" },
  },
  {
    id: "p2",
    name: "Mugs",
    categoryId: "MCO166167",
    origin: "MANUAL",
    state: "ACCEPTED",
    stockSafetyBuffer: 1,
    candidates: null,
    localCategory: { id: "c2", name: "Mugs" },
  },
];

function mockFetch() {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
    if (init?.method === "PATCH") return json({ ...profiles[0], state: "ACCEPTED", categoryId: "MCO999" });
    if (init?.method === "DELETE") return json({ deleted: true });
    return json(profiles);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("MercadoLibreProfilesPanel", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("muestra cada subcategoría con su categoría, si es aprendida o manual y si está sugerida", async () => {
    mockFetch();
    render(<MercadoLibreProfilesPanel storeId="s" />);
    const row = (await screen.findByText("Cartucheras", { selector: "h3" })).closest("li")!;
    expect(within(row).getByText("Aprendido")).toBeInTheDocument();
    expect(within(row).getByText("Sugerida")).toBeInTheDocument();
    expect(within(row).getByText(/3 publicaciones/)).toBeInTheDocument();
    const mugs = screen.getByText("Mugs", { selector: "h3" }).closest("li")!;
    expect(within(mugs).getByText("Manual")).toBeInTheDocument();
    expect(within(mugs).queryByText("Sugerida")).not.toBeInTheDocument();
  });

  it("«Usar esta» acepta la categoría elegida; desde ahí se aplica sola", async () => {
    const fetchMock = mockFetch();
    render(<MercadoLibreProfilesPanel storeId="s" />);
    const row = (await screen.findByText("Cartucheras", { selector: "h3" })).closest("li")!;
    fireEvent.click(within(row).getByRole("button", { name: "Usar esta: Estuches" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/s/marketplaces/mercadolibre/profiles/p1", expect.objectContaining({ method: "PATCH" })));
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === "PATCH")!;
    expect(JSON.parse(String(call[1]!.body))).toEqual({ categoryId: "MCO999" });
    expect(await within(row).findByText("Aceptada")).toBeInTheDocument();
  });
});
