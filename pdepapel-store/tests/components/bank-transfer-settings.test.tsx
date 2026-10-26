/* @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-clipboard", () => ({ useClipboard: () => ({ onCopy: vi.fn().mockResolvedValue(true) }) }));

import { BankTransferInstructions } from "@/components/bank-transfer-instructions";
import { PaymentMethodSelector } from "@/components/ui/payment-method-selector";
import { PaymentMethod } from "@/constants";
import { StorefrontSettingsProvider } from "@/providers/storefront-settings-provider";
import type { BankTransferInfo } from "@/types";

// Valores de mentira: los reales viven en Configuración del panel.
const complete: BankTransferInfo = { account: "Ahorros Banco Prueba 000-TEST-00", breBKey: "@llave-de-prueba", whatsappNumber: "573000000000" };
const order = { id: "o1", orderNumber: "ORD-1", total: 20000 };

const withSettings = (bankTransfer: BankTransferInfo, node: React.ReactNode) =>
  render(
    <StorefrontSettingsProvider value={{ freeShippingThreshold: null, deliveryEstimate: null, bankTransfer }}>{node}</StorefrontSettingsProvider>,
  );

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("datos de transferencia desde Configuración", () => {
  it("la página del pedido muestra la llave, la cuenta y el WhatsApp configurados", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    withSettings(complete, <BankTransferInstructions order={order} />);
    expect(screen.getByText("@llave-de-prueba")).toBeTruthy();
    expect(screen.getByText("300 000 0000")).toBeTruthy();
    const link = screen.getByRole("link", { name: /Enviar Comprobante por WhatsApp/i });
    expect(link.getAttribute("href")).toMatch(/^https:\/\/wa\.me\/573000000000\?text=/);
    expect(error).not.toHaveBeenCalled();
  });

  it.each([
    ["sin llave Bre-B", { ...complete, breBKey: null }],
    ["sin cuenta", { ...complete, account: null }],
    ["sin WhatsApp", { ...complete, whatsappNumber: null }],
  ])("%s: nunca un bloque vacío, sale «Escríbenos por WhatsApp para los datos de pago» y un error en el registro", (_label, info) => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    withSettings(info, <BankTransferInstructions order={order} />);
    expect(screen.getByText(/Escríbenos por WhatsApp para los datos de pago/)).toBeTruthy();
    expect(screen.queryByText("@llave-de-prueba")).toBeNull();
    expect(screen.getByRole("link", { name: /Escribirnos por WhatsApp/ }).getAttribute("href")).toMatch(/^https:\/\/wa\.me\/57\d{10}\?text=/);
    expect(error).toHaveBeenCalledWith(expect.stringMatching(/\[BANK_TRANSFER_INFO\] página del pedido: faltan/));
  });

  it("el checkout muestra la cuenta y el WhatsApp de Configuración; vacío, el aviso", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { unmount } = withSettings(complete, <PaymentMethodSelector value={PaymentMethod.BankTransfer} onChange={() => undefined} />);
    expect(screen.getByText(/000-TEST-00/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /WhatsApp 300 000 0000/ })).toBeTruthy();
    unmount();

    withSettings({ account: null, breBKey: null, whatsappNumber: null }, <PaymentMethodSelector value={PaymentMethod.BankTransfer} onChange={() => undefined} />);
    expect(screen.getByText(/Escríbenos por WhatsApp para los datos de pago/)).toBeTruthy();
  });
});
