// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  search: vi.fn(),
  track: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock("@/lib/customer-analytics", () => ({ trackCustomerEvent: mocks.track }));
vi.mock("@/hooks/use-search-products", () => ({
  default: (term: string) => {
    mocks.search(term);
    return term
      ? {
          status: "success",
          data: [
            {
              id: "p1",
              slug: "agenda-capibara",
              name: "Agenda Capibara",
              price: "45000",
              image: { id: "i", url: "https://img/a.png" },
            },
          ],
        }
      : { status: "pending", data: undefined };
  },
}));
vi.mock("@/hooks/use-debounce", () => ({ useDebounce: (value: string) => value }));
vi.mock("react-intersection-observer", () => ({ useInView: () => ({ ref: vi.fn() }) }));
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img {...(props as Record<string, string>)} />
  ),
}));

import { SearchBar } from "@/components/search-bar";

describe("SearchBar", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(cleanup);

  it("shows suggestions while typing and navigates to the catalog on submit", async () => {
    render(<SearchBar variant="desktop" />);
    const input = screen.getByRole("combobox", { name: "Buscar productos" });

    fireEvent.change(input, { target: { value: "agenda" } });

    expect(await screen.findByRole("link", { name: /Agenda Capibara/ })).toHaveAttribute(
      "href",
      "/producto/agenda-capibara",
    );
    expect(input).toHaveAttribute("aria-expanded", "true");

    fireEvent.click(screen.getByRole("button", { name: "Buscar" }));

    expect(mocks.push).toHaveBeenCalledWith("/tienda?search=agenda");
    expect(mocks.track).toHaveBeenCalledWith("search", { search_term: "agenda" });
    await waitFor(() => expect(input).toHaveAttribute("aria-expanded", "false"));
  });

  it("does not query for a single character and clears with Escape", () => {
    render(<SearchBar variant="inline" />);
    const input = screen.getByRole("combobox", { name: "Buscar productos" });

    fireEvent.change(input, { target: { value: "a" } });
    expect(mocks.search).toHaveBeenLastCalledWith("");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    fireEvent.change(input, { target: { value: "agenda" } });
    fireEvent.keyDown(input, { key: "Escape" });

    expect(input).toHaveValue("");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("ignores an empty submit instead of navigating", () => {
    render(<SearchBar variant="inline" />);

    fireEvent.submit(screen.getByRole("search"));

    expect(mocks.push).not.toHaveBeenCalled();
  });
});
