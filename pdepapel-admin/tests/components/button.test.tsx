// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { Button } from "@/components/ui/button";

afterEach(cleanup);

describe("Button", () => {
  it("does not submit a surrounding form unless it is declared as submit", () => {
    const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
    render(
      <form onSubmit={onSubmit}>
        <Button>Cancelar</Button>
        <Button type="submit">Guardar</Button>
      </form>,
    );

    expect(screen.getByRole("button", { name: "Cancelar" })).toHaveAttribute(
      "type",
      "button",
    );
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onSubmit).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("blocks interaction and announces busy while loading", () => {
    const onClick = vi.fn();
    render(
      <Button isLoading loadingText="Guardando…" onClick={onClick}>
        Guardar
      </Button>,
    );

    const button = screen.getByRole("button", { name: /Guardando/ });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("aria-busy", "true");
    fireEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders as the child element with asChild", () => {
    render(
      <Button asChild variant="soft">
        <a href="/tienda">Ver tienda</a>
      </Button>,
    );

    const link = screen.getByRole("link", { name: "Ver tienda" });
    expect(link).toHaveAttribute("href", "/tienda");
    expect(link.className).toContain("bg-accent");
  });
});
