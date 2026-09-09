// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { describeSavedQuery, SavedSearches } from "@/components/saved-searches";

const { auth, getSavedSearches, deleteSavedSearch } = vi.hoisted(() => ({
  auth: { userId: "user_1" as string | null, isLoaded: true, getToken: vi.fn() },
  getSavedSearches: vi.fn(),
  deleteSavedSearch: vi.fn(),
}));

vi.mock("@clerk/nextjs", () => ({ useAuth: () => auth }));
vi.mock("@/actions/account-saved-searches", () => ({ getSavedSearches, deleteSavedSearch }));
vi.mock("@/hooks/use-toast", () => ({ toast: vi.fn() }));

const saved = { id: "s1", name: "Stickers rosados", query: "search=stickers&colorId=pink&sortOption=priceAsc", createdAt: "2026-09-01T12:00:00.000Z" };

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <SavedSearches />
    </QueryClientProvider>,
  );
}

describe("SavedSearches", () => {
  beforeEach(() => {
    auth.userId = "user_1";
    auth.getToken.mockResolvedValue("token");
    getSavedSearches.mockResolvedValue([saved]);
    deleteSavedSearch.mockResolvedValue(undefined);
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("describes a saved query in plain words", () => {
    expect(describeSavedQuery(saved.query)).toBe("«stickers» · filtros: color, orden");
    expect(describeSavedQuery("")).toBe("Todos los productos");
  });

  it("lists saved searches with a link back to the shop", async () => {
    renderPage();
    expect(await screen.findByText("Stickers rosados")).toBeTruthy();
    const link = screen.getByRole("link", { name: "Ver resultados" });
    expect(link.getAttribute("href")).toBe(`/tienda?${saved.query}`);
    expect(getSavedSearches).toHaveBeenCalledWith("token");
  });

  it("removes a search from the list after deleting it", async () => {
    renderPage();
    await screen.findByText("Stickers rosados");
    await userEvent.click(screen.getByRole("button", { name: "Eliminar la búsqueda Stickers rosados" }));
    await waitFor(() => expect(deleteSavedSearch).toHaveBeenCalledWith("token", "s1"));
    await waitFor(() => expect(screen.queryByText("Stickers rosados")).toBeNull());
  });

  it("invites signed-out visitors to sign in", () => {
    auth.userId = null;
    renderPage();
    expect(screen.getByRole("link", { name: /Iniciar sesión/ })).toBeTruthy();
    expect(getSavedSearches).not.toHaveBeenCalled();
  });
});
