// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SaveSearchButton } from "@/components/shop/save-search-button";

const { auth, createSavedSearch, toast, searchParams } = vi.hoisted(() => ({
  auth: { userId: "user_1" as string | null, isLoaded: true, getToken: vi.fn() },
  createSavedSearch: vi.fn(),
  toast: vi.fn(),
  searchParams: { value: "search=washi&page=2" },
}));

vi.mock("@clerk/nextjs", () => ({ useAuth: () => auth }));
vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams(searchParams.value) }));
vi.mock("@/actions/account-saved-searches", () => ({ createSavedSearch }));
vi.mock("@/hooks/use-toast", () => ({ toast }));
vi.mock("@/lib/customer-analytics", () => ({ trackCustomerEvent: vi.fn() }));

function renderButton(fixedCategoryId?: string) {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <SaveSearchButton suggestedName="«washi»" fixedCategoryId={fixedCategoryId} />
    </QueryClientProvider>,
  );
}

describe("SaveSearchButton", () => {
  beforeEach(() => {
    auth.userId = "user_1";
    auth.getToken.mockResolvedValue("token");
    createSavedSearch.mockResolvedValue({ search: { id: "s1" } });
    window.HTMLElement.prototype.setPointerCapture = vi.fn();
    window.HTMLElement.prototype.hasPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = vi.fn();
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders nothing for visitors without a session", () => {
    auth.userId = null;
    renderButton();
    expect(screen.queryByRole("button", { name: /Guardar búsqueda/ })).toBeNull();
  });

  it("saves the current filters without the page and with the fixed category", async () => {
    renderButton("cat-1");
    await userEvent.click(screen.getByRole("button", { name: /Guardar búsqueda/ }));
    const input = await screen.findByLabelText("Nombre");
    expect((input as HTMLInputElement).value).toBe("«washi»");
    await userEvent.clear(input);
    await userEvent.type(input, "Washi tapes");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(createSavedSearch).toHaveBeenCalledWith("token", { name: "Washi tapes", query: "search=washi&categoryId=cat-1" }));
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Búsqueda guardada" })));
  });
});
