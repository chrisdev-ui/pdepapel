// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SWRConfig } from "swr";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const http = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
const toast = vi.hoisted(() => vi.fn());
vi.mock("axios", () => ({ default: { ...http, isAxiosError: (error: { isAxiosError?: boolean }) => Boolean(error?.isAxiosError) } }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast }) }));

import { PreorderWaitlistPanel } from "@/components/presales/preorder-waitlist-panel";
import { ViewerAccessProvider } from "@/components/shell/viewer-access";

const entry = {
  id: "entry-1",
  name: "Clienta Uno",
  phone: "+573001112233",
  handle: null,
  email: null,
  channel: "WHATSAPP",
  status: "WAITING",
  note: null,
  presaleId: "presale-1",
  orderId: null,
  createdAt: "2026-10-29T04:20:00.000Z",
  contactedAt: null,
};

let saved: (typeof entry)[] = [];

beforeEach(() => {
  saved = [];
  http.get.mockImplementation(async () => ({
    data: { entries: saved, counts: { WAITING: saved.length, CONTACTED: 0, CONVERTED: 0, DISCARDED: 0 } },
  }));
  http.post.mockImplementation(async () => {
    saved = [entry];
    return { data: { entry, duplicate: false } };
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

/** La ficha del producto es un <form>: el panel vive adentro y no puede enviarlo. */
function renderInsideProductForm(onProductSubmit: () => void) {
  return render(
    <SWRConfig value={{ provider: () => new Map(), dedupingInterval: 0 }}>
      <ViewerAccessProvider role="owner">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onProductSubmit();
          }}
        >
          <PreorderWaitlistPanel storeId="store-1" productId="product-1" presaleId="presale-1" />
        </form>
      </ViewerAccessProvider>
    </SWRConfig>,
  );
}

describe("lista de espera dentro de la ficha del producto", () => {
  it("«Agregar» guarda en la lista, la muestra enseguida y no guarda la ficha", async () => {
    const productSubmit = vi.fn();
    renderInsideProductForm(productSubmit);
    await screen.findByText(/Todavía no hay nadie/);

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Clienta Uno" } });
    fireEvent.change(screen.getByLabelText("Teléfono o @usuario"), { target: { value: "3001112233" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
    expect(http.post).toHaveBeenCalledWith("/api/store-1/preorder-waitlist", expect.objectContaining({ productId: "product-1", name: "Clienta Uno", channel: "WHATSAPP" }));
    expect(await screen.findByText("Clienta Uno")).toBeInTheDocument();
    expect(productSubmit).not.toHaveBeenCalled();
  });

  it("Enter en un campo agrega a la lista, no guarda la ficha", async () => {
    const productSubmit = vi.fn();
    renderInsideProductForm(productSubmit);
    await screen.findByText(/Todavía no hay nadie/);

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Clienta Uno" } });
    const contact = screen.getByLabelText("Teléfono o @usuario");
    fireEvent.change(contact, { target: { value: "3001112233" } });
    fireEvent.keyDown(contact, { key: "Enter" });

    await waitFor(() => expect(http.post).toHaveBeenCalledTimes(1));
    expect(productSubmit).not.toHaveBeenCalled();
  });

  it("sin teléfono: el mensaje se ve y no se envía nada", async () => {
    const productSubmit = vi.fn();
    renderInsideProductForm(productSubmit);
    await screen.findByText(/Todavía no hay nadie/);

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Clienta Uno" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ description: "Escribe un teléfono o un @usuario.", variant: "destructive" })));
    expect(http.post).not.toHaveBeenCalled();
    expect(productSubmit).not.toHaveBeenCalled();
  });

  it("si el servidor rechaza, se ve su mensaje", async () => {
    http.post.mockRejectedValueOnce(Object.assign(new Error("400"), { isAxiosError: true, response: { data: { error: "Revisa el número de WhatsApp." } } }));
    renderInsideProductForm(vi.fn());
    await screen.findByText(/Todavía no hay nadie/);

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Clienta Uno" } });
    fireEvent.change(screen.getByLabelText("Teléfono o @usuario"), { target: { value: "123" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar" }));

    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({ title: "No se pudo agregar", variant: "destructive" })));
    const call = toast.mock.calls.find(([arg]) => arg.title === "No se pudo agregar")![0];
    expect(String(call.description)).toContain("Revisa el número de WhatsApp.");
  });
});
