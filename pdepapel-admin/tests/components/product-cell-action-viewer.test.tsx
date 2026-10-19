// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1" }), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/app/(dashboard)/[storeId]/(routes)/productos/components/product-delete-dialog", () => ({ ProductDeleteDialog: () => null }));

import { ViewerAccessProvider } from "@/components/shell/viewer-access";
import { CellAction } from "@/app/(dashboard)/[storeId]/(routes)/productos/components/cell-action";

const data = { id: "p1", name: "Libreta", sku: "LIB-1", slug: "libreta", productGroup: null } as never;

afterEach(cleanup);

/** «Duplicar» es crear: la cuenta de solo lectura no ve la opción (y el servidor responde 403). */
describe("menú de fila de Productos", () => {
  it("sin «Duplicar» para la cuenta de solo lectura", async () => {
    render(<ViewerAccessProvider role="viewer"><CellAction data={data} /></ViewerAccessProvider>);
    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByText("Copiar SKU")).toBeInTheDocument();
    expect(screen.queryByText("Duplicar")).toBeNull();
  });

  it("la dueña sí la ve", async () => {
    render(<ViewerAccessProvider role="owner"><CellAction data={data} /></ViewerAccessProvider>);
    await userEvent.click(screen.getByRole("button"));
    expect(await screen.findByText("Duplicar")).toBeInTheDocument();
  });
});
