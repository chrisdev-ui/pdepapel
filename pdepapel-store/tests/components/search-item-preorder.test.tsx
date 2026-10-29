// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/ui/cloudinary-image", () => ({ CloudinaryImage: () => null }));

import { SearchItem } from "@/components/search-item";

afterEach(cleanup);

const row = (props: Partial<Parameters<typeof SearchItem>[0]>) =>
  render(
    <ul>
      <SearchItem id="p1" slug="calendario" name="Calendario de adviento" price={160000} closeAll={() => undefined} {...props} />
    </ul>,
  );

/** El desplegable del buscador: una preventa tiene stock 0 y no es «Agotado» (calendario, 2026-10-29). */
describe("fila del buscador", () => {
  it("con preventa abierta dice «Preventa», nunca «Agotado»", () => {
    row({ stock: 0, isPreorder: true });
    expect(screen.getByText("Preventa")).toBeInTheDocument();
    expect(screen.queryByText("Agotado")).toBeNull();
  });

  it("sin preventa y sin stock sigue diciendo «Agotado»", () => {
    row({ stock: 0 });
    expect(screen.getByText("Agotado")).toBeInTheDocument();
  });
});
