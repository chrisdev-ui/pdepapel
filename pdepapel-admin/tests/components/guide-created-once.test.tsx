// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { FormProvider, useForm, type UseFormReturn } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * ORD-1793673348281-170 (2026-11-03): Paula pulsó «Crear guía», la guía salió y la página siguió
 * mostrando «Guardar y crear guía». En cuanto EnvioClick responde, el bloque deja de ofrecer crearla
 * y muestra el número, aunque el refresco de la página no llegue.
 */
const mocks = vi.hoisted(() => ({ post: vi.fn(), toast: vi.fn(), refresh: vi.fn() }));

vi.mock("axios", () => ({
  default: { post: mocks.post, isAxiosError: (error: { isAxiosError?: boolean }) => Boolean(error?.isAxiosError) },
  isAxiosError: (error: { isAxiosError?: boolean }) => Boolean(error?.isAxiosError),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: mocks.refresh }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: mocks.toast }) }));
vi.mock("next/image", () => ({ default: (props: { alt: string }) => <span>{props.alt}</span> }));
vi.mock("@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-form/shipping/box-select", () => ({ BoxSelect: () => null }));

import { EnvioClickBlock } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-form/shipping/envioclick-block";
import type { OrderFormValues, ShippingQuote } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-form/schema";

const RATE: ShippingQuote = { idRate: 26689253, carrier: "ENVIA", product: "Normal", flete: 13997, minimumInsurance: 0, totalCost: 13997, deliveryDays: 3, isCOD: false, codCost: null };

function Harness({ children }: { children: ReactNode }) {
  const form = useForm({
    defaultValues: {
      city: "Bogotá",
      daneCode: "11001000",
      address: "Centro",
      orderItems: [{ productId: "p-1", name: "Lapicero", quantity: 1, price: 14000 }],
      shipping: { isCOD: false, boxId: undefined, carrierName: "ENVIA", cost: 13997 },
      envioClickIdRate: 26689253,
    },
  });
  return <FormProvider {...(form as unknown as UseFormReturn<OrderFormValues>)}>{children}</FormProvider>;
}

const order = {
  id: "order-1",
  status: "PAID",
  shipping: { envioClickIdRate: 26689253, envioClickIdOrder: null, isCOD: false, guideError: null, guideAttemptedAt: null },
};

const renderBlock = () =>
  render(
    <Harness>
      <EnvioClickBlock
        storeId="store-1"
        boxes={[]}
        initialData={order as never}
        loading={false}
        loadingQuotes={false}
        shippingQuotes={[RATE]}
        quotedAt={new Date()}
        recommendedBox={null}
        onGetShippingQuotes={vi.fn().mockResolvedValue(null)}
        onSelectRate={vi.fn()}
        onDiscard={vi.fn()}
        discarding={false}
        setCOD={vi.fn()}
      />
    </Harness>,
  );

const confirmCreate = async () => {
  fireEvent.click(screen.getByRole("button", { name: /^Crear guía ·/ }));
  return screen.findByRole("button", { name: "Sí, crear la guía" });
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("después de crear la guía", () => {
  it("el botón desaparece y se ve el número de guía, aunque el refresco no traiga nada nuevo", async () => {
    mocks.post.mockResolvedValue({ data: { success: true, alreadyCreated: false, data: { idOrder: 4823557, tracker: "034059511182" } } });
    renderBlock();
    fireEvent.click(await confirmCreate());

    const notice = await screen.findByTestId("guide-created");
    expect(notice).toHaveTextContent("Guía de EnvioClick creada");
    expect(notice).toHaveTextContent("034059511182");
    expect(within(notice).getByRole("link", { name: "Ver la guía (PDF)" })).toHaveAttribute("href", "/api/store-1/orders/order-1/guide");
    expect(screen.queryByRole("button", { name: /crear guía/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Descartar tarifa/ })).not.toBeInTheDocument();
    expect(mocks.refresh).toHaveBeenCalled();
  });

  it("si el pedido ya tenía guía (otra pestaña), lo dice y tampoco ofrece crear otra", async () => {
    mocks.post.mockResolvedValue({ data: { success: true, alreadyCreated: true, data: { idOrder: 4823557, tracker: "034059511182" } } });
    renderBlock();
    fireEvent.click(await confirmCreate());

    expect(await screen.findByTestId("guide-created")).toHaveTextContent("Este pedido ya tenía guía de EnvioClick");
    expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ title: "Este pedido ya tenía guía" }));
    expect(screen.queryByRole("button", { name: /crear guía/i })).not.toBeInTheDocument();
  });

  it("un doble toque en «Sí, crear la guía» manda una sola petición", async () => {
    let finish!: (value: unknown) => void;
    mocks.post.mockReturnValue(new Promise((resolve) => (finish = resolve)));
    renderBlock();
    const confirm = await confirmCreate();
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await act(async () => finish({ data: { success: true, alreadyCreated: false, data: { idOrder: 1, tracker: "G1" } } }));
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId("guide-created")).toHaveTextContent("G1");
  });

  it("un pedido que ya tiene guía muestra su número y el PDF, sin botón para crear otra", () => {
    render(
      <Harness>
        <EnvioClickBlock
          storeId="store-1"
          boxes={[]}
          initialData={{ ...order, shipping: { ...order.shipping, envioClickIdOrder: 4823557, trackingCode: "034059511182" } } as never}
          loading={false}
          loadingQuotes={false}
          shippingQuotes={[RATE]}
          quotedAt={new Date()}
          recommendedBox={null}
          onGetShippingQuotes={vi.fn().mockResolvedValue(null)}
          onSelectRate={vi.fn()}
          onDiscard={vi.fn()}
          discarding={false}
          setCOD={vi.fn()}
        />
      </Harness>,
    );
    expect(screen.getByTestId("guide-created")).toHaveTextContent("034059511182");
    expect(screen.queryByRole("button", { name: /crear guía/i })).not.toBeInTheDocument();
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("si la respuesta falla, la página se refresca para mostrar lo que quedó en el servidor", async () => {
    mocks.post.mockRejectedValue({ isAxiosError: true, response: { status: 500, data: { error: "Error interno del servidor" } } });
    renderBlock();
    fireEvent.click(await confirmCreate());
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ variant: "destructive" })));
    expect(mocks.refresh).toHaveBeenCalled();
    expect(screen.queryByTestId("guide-created")).not.toBeInTheDocument();
  });
});
