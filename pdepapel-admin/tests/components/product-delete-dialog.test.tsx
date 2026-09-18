// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ProductDeleteDialog } from "@/app/(dashboard)/[storeId]/(routes)/productos/components/product-delete-dialog";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), del: vi.fn(), toast: vi.fn() }));

vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1" }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("axios", () => ({ default: { get: mocks.get, post: mocks.post, delete: mocks.del } }));

const blockedCheck = {
  productId: "p1",
  name: "Cosmetiquera",
  slug: "cosmetiquera",
  blocked: true,
  blockers: [
    { kind: "pedidos", label: "Pedidos", count: 3, detail: "3 pedidos lo incluyen; su historial se perdería." },
    { kind: "kits", label: "Kits", count: 1, detail: "Es componente de «Kit escolar»." },
  ],
  removes: { images: 2, aliases: 0, initialMovements: 1 },
};

/** Eliminar nombra lo que bloquea y ofrece archivar; libre, pide confirmación explícita. */
describe("ProductDeleteDialog", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("lists the real blockers and archives instead", async () => {
    mocks.get.mockResolvedValue({ data: blockedCheck });
    mocks.post.mockResolvedValue({ data: { pausedListings: 1 } });
    const onDone = vi.fn();
    render(<ProductDeleteDialog productId="p1" productName="Cosmetiquera" isArchived={false} open onOpenChange={() => undefined} onDone={onDone} />);

    expect(await screen.findByText("No se puede eliminar «Cosmetiquera»")).toBeInTheDocument();
    expect(screen.getByText(/3 pedidos lo incluyen/)).toBeInTheDocument();
    expect(screen.getByText(/Kit escolar/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Eliminar definitivamente/ })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Archivar en su lugar" }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/api/store-1/products/bulk-update", { productIds: ["p1"], field: "isArchived", value: true }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("archived"));
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ description: expect.stringContaining("Mercado Libre se pausa") }));
  });

  it("requires the checkbox before deleting a free product", async () => {
    mocks.get.mockResolvedValue({ data: { ...blockedCheck, blocked: false, blockers: [] } });
    mocks.del.mockResolvedValue({});
    const onDone = vi.fn();
    render(<ProductDeleteDialog productId="p1" productName="Cosmetiquera" isArchived={false} open onOpenChange={() => undefined} onDone={onDone} />);

    const remove = await screen.findByRole("button", { name: "Eliminar definitivamente" });
    expect(remove).toBeDisabled();
    expect(screen.getByText(/2 fotos se borran/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox", { name: "Confirmo que quiero eliminarlo" }));
    expect(remove).toBeEnabled();
    fireEvent.click(remove);
    await waitFor(() => expect(mocks.del).toHaveBeenCalledWith("/api/store-1/products/p1"));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("deleted"));
  });
});
