// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ page: 2, setPage: vi.fn(), search: "page=2" }));

vi.mock("nuqs", () => ({
  parseAsInteger: { withDefault: () => ({}) },
  useQueryState: () => [mocks.page, mocks.setPage],
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/categoria/cuadernos",
  useSearchParams: () => new URLSearchParams(mocks.search),
}));

import Paginator from "@/app/(routes)/tienda/components/paginator";

describe("Paginator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.page = 2;
    mocks.search = "page=2";
    window.scrollTo = vi.fn();
  });
  afterEach(cleanup);

  it("renders numbered pages with the caption and moves through them", async () => {
    const user = userEvent.setup();
    render(<Paginator totalPages={83} />);

    expect(screen.getByRole("link", { name: "2" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Página 2 de 83 · 24 productos por página")).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Ir a la página siguiente" }));
    expect(mocks.setPage).toHaveBeenCalledWith(3);
    await user.click(screen.getByRole("link", { name: "1" }));
    expect(mocks.setPage).toHaveBeenCalledWith(null);
  });

  /** P1-5: cada página es un enlace rastreable; la 1 es la URL base. */
  it("links every page to its own url and keeps the other filters", () => {
    mocks.search = "page=2&colorId=rosa";
    render(<Paginator totalPages={5} />);

    expect(screen.getByRole("link", { name: "1" })).toHaveAttribute("href", "/categoria/cuadernos?colorId=rosa");
    expect(screen.getByRole("link", { name: "3" })).toHaveAttribute("href", "/categoria/cuadernos?page=3&colorId=rosa");
    expect(screen.getByRole("link", { name: "Ir a la página anterior" })).toHaveAttribute("href", "/categoria/cuadernos?colorId=rosa");
    expect(screen.getByRole("link", { name: "Ir a la página siguiente" })).toHaveAttribute("href", "/categoria/cuadernos?page=3&colorId=rosa");
  });

  it("serves the page links in the server html", () => {
    const html = renderToString(<Paginator totalPages={5} />);
    expect(html).toContain('href="/categoria/cuadernos?page=3"');
    expect(html).toContain('href="/categoria/cuadernos"');
  });

  it("leaves the edge links without href and marked as disabled", () => {
    mocks.page = 1;
    mocks.search = "";
    const { container } = render(<Paginator totalPages={3} />);

    const previous = container.querySelector('[aria-label="Ir a la página anterior"]');
    expect(previous).not.toHaveAttribute("href");
    expect(previous).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("link", { name: "Ir a la página siguiente" })).toHaveAttribute("href", "/categoria/cuadernos?page=2");
  });

  it("lets a modified click open the page url instead of paging in place", () => {
    render(<Paginator totalPages={5} />);
    const three = screen.getByRole("link", { name: "3" });

    const modified = new MouseEvent("click", { bubbles: true, cancelable: true, metaKey: true });
    three.dispatchEvent(modified);
    expect(modified.defaultPrevented).toBe(false);
    expect(mocks.setPage).not.toHaveBeenCalled();

    const plain = new MouseEvent("click", { bubbles: true, cancelable: true });
    three.dispatchEvent(plain);
    expect(plain.defaultPrevented).toBe(true);
    expect(mocks.setPage).toHaveBeenCalledWith(3);
  });

  it("keeps the ellipsis inside a list item", () => {
    const { container } = render(<Paginator totalPages={83} />);
    for (const child of Array.from(container.querySelector("ul")!.children)) {
      expect(child.tagName).toBe("LI");
    }
  });

  it("renders nothing for a single page", () => {
    const { container } = render(<Paginator totalPages={1} />);
    expect(container).toBeEmptyDOMElement();
  });
});
