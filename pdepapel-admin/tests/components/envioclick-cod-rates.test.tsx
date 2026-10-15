// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { FormProvider, useForm, type UseFormReturn } from "react-hook-form";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Contra entrega (ORD-1791998787841-915, 2026-10-15): con «Pago contra
 * entrega» marcado solo se pueden elegir tarifas que recaudan, cada una dice
 * lo que cobra EnvioClick por recaudar y, si ninguna recauda en la ciudad, la
 * sección lo dice en vez de dejar elegir una que haría fallar la guía.
 */
vi.mock("next/image", () => ({ default: (props: { alt: string }) => <span>{props.alt}</span> }));
vi.mock("@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-form/shipping/box-select", () => ({ BoxSelect: () => null }));
vi.mock("@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-form/shipping/guide-panel", () => ({ GuidePanel: () => null }));

import { EnvioClickBlock } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-form/shipping/envioclick-block";
import type { OrderFormValues, ShippingQuote } from "@/app/(dashboard)/[storeId]/(routes)/pedidos/[orderId]/components/order-form/schema";

const rate = (idRate: number, carrier: string, isCOD: boolean, codCost: number | null = null): ShippingQuote => ({
  idRate,
  carrier,
  product: "Normal",
  flete: 17000,
  minimumInsurance: 1000,
  totalCost: 18000,
  deliveryDays: 3,
  isCOD,
  codCost,
});

function Harness({ isCOD, children }: { isCOD: boolean; children: ReactNode }) {
  const form = useForm({
    defaultValues: { city: "La Dorada", daneCode: "17380000", address: "Centro", orderItems: [{ productId: "p-1", name: "Libreta", quantity: 1, price: 8000 }], shipping: { isCOD, boxId: undefined, carrierName: "", cost: 0 }, envioClickIdRate: undefined },
  });
  return <FormProvider {...(form as unknown as UseFormReturn<OrderFormValues>)}>{children}</FormProvider>;
}

const renderBlock = (isCOD: boolean, quotes: ShippingQuote[], onSelectRate = vi.fn()) =>
  render(
    <Harness isCOD={isCOD}>
      <EnvioClickBlock
        storeId="store-1"
        boxes={[]}
        initialData={null as never}
        loading={false}
        loadingQuotes={false}
        shippingQuotes={quotes}
        quotedAt={new Date()}
        recommendedBox={null}
        onGetShippingQuotes={vi.fn().mockResolvedValue(null)}
        onSelectRate={onSelectRate}
        onDiscard={vi.fn()}
        discarding={false}
        setCOD={vi.fn()}
      />
    </Harness>,
  );

afterEach(cleanup);

describe("tarifas con «Pago contra entrega»", () => {
  it("si ninguna recauda en la ciudad, no ofrece ninguna y lo dice", () => {
    renderBlock(true, [rate(1, "ENVIA", false), rate(2, "COORDINADORA", false)]);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.getByTestId("no-cod-rates")).toHaveTextContent("Ninguna transportadora de EnvioClick recauda contra entrega en La Dorada");
  });

  it("ofrece solo las que recaudan y muestra lo que cobra EnvioClick por recaudar", () => {
    renderBlock(true, [rate(1, "ENVIA", false), rate(2, "COORDINADORA", true, 7000)]);
    const radios = screen.getAllByRole("radio");
    expect(radios).toHaveLength(1);
    expect(radios[0]).toHaveAttribute("value", "2");
    expect(screen.queryByText("ENVIA")).not.toBeInTheDocument();
    expect(screen.getByText(/\+ recaudo/)).toHaveTextContent("7.000");
    expect(screen.queryByTestId("no-cod-rates")).not.toBeInTheDocument();
  });

  it("sin contra entrega se pueden elegir todas", () => {
    renderBlock(false, [rate(1, "ENVIA", false), rate(2, "COORDINADORA", true, 7000)]);
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.queryByTestId("no-cod-rates")).not.toBeInTheDocument();
  });
});
