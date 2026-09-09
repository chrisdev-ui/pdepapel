// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ page: 2, setPage: vi.fn() }));

vi.mock("nuqs", () => ({
  parseAsInteger: { withDefault: () => ({}) },
  useQueryState: () => [mocks.page, mocks.setPage],
}));

import Paginator from "@/app/(routes)/tienda/components/paginator";

describe("Paginator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.scrollTo = vi.fn();
  });
  afterEach(cleanup);

  it("renders numbered pages with the caption and moves through them", async () => {
    const user = userEvent.setup();
    render(<Paginator totalPages={83} />);

    expect(screen.getByRole("button", { name: "2" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByText("Página 2 de 83 · 24 productos por página")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Ir a la página siguiente" }));
    expect(mocks.setPage).toHaveBeenCalledWith(3);
    await user.click(screen.getByRole("button", { name: "1" }));
    expect(mocks.setPage).toHaveBeenCalledWith(null);
  });

  it("renders nothing for a single page", () => {
    const { container } = render(<Paginator totalPages={1} />);
    expect(container).toBeEmptyDOMElement();
  });
});
