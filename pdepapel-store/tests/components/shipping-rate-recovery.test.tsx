/* @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  ShippingRateRecovery,
  type RecoveryRate,
} from "@/app/(routes)/finalizar-compra/components/steps/shipping-rate-recovery";

afterEach(cleanup);

const tarifa = (over: Partial<RecoveryRate> = {}): RecoveryRate => ({
  idRate: 26341752,
  carrier: "ENVIA",
  product: "Normal",
  flete: 15622,
  minimumInsurance: 0,
  totalCost: 15622,
  deliveryDays: 2,
  isCOD: false,
  ...over,
});

const render_ = (props: Partial<React.ComponentProps<typeof ShippingRateRecovery>> = {}) => {
  const onConfirm = vi.fn();
  const onChooseAnother = vi.fn();
  render(
    <ShippingRateRecovery
      recovery={{ kind: "changed", rate: tarifa(), previousCost: 13997 }}
      onConfirm={onConfirm}
      onChooseAnother={onChooseAnother}
      isSubmitting={false}
      {...props}
    />,
  );
  return { onConfirm, onChooseAnother };
};

describe("cuando el envío cambió de precio", () => {
  it("dice qué pasó y tranquiliza: no se ha cobrado nada", () => {
    render_();
    expect(screen.getByText(/El costo del envío cambió mientras comprabas/i)).toBeInTheDocument();
    expect(screen.getByText(/no se ha cobrado nada/i)).toBeInTheDocument();
    // Y no se le habla de un error: se le habla de lo que tiene que hacer.
    expect(screen.queryByText(/error/i)).not.toBeInTheDocument();
  });

  it("enseña el precio viejo tachado y el nuevo", () => {
    render_();
    const caja = screen.getByTestId("shipping-rate-recovery");
    expect(within(caja).getByText("ENVIA")).toBeInTheDocument();
    expect(caja.textContent).toContain("15.622");
    expect(caja.textContent).toContain("13.997");
  });

  it("un solo botón para seguir, y devuelve la tarifa nueva", async () => {
    const { onConfirm } = render_();
    await userEvent.click(screen.getByRole("button", { name: /confirmar y continuar/i }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ idRate: 26341752 }));
  });

  it("también se puede volver a elegir el envío", async () => {
    const { onChooseAnother } = render_();
    await userEvent.click(screen.getByRole("button", { name: /elegir otro envío/i }));
    expect(onChooseAnother).toHaveBeenCalledOnce();
  });

  it("mientras se reenvía, los botones no se pueden tocar dos veces", () => {
    render_({ isSubmitting: true });
    expect(screen.getByRole("button", { name: /confirmando/i })).toBeDisabled();
    expect(screen.getByRole("button", { name: /elegir otro envío/i })).toBeDisabled();
  });

  it("sin precio anterior no se enseña un tachado inventado", () => {
    render_({ recovery: { kind: "changed", rate: tarifa(), previousCost: 0 } });
    expect(screen.getByTestId("shipping-rate-recovery").textContent).not.toContain("0");
  });
});

describe("cuando la transportadora ya no llega", () => {
  const sinCobertura = {
    kind: "unavailable" as const,
    alternatives: [
      tarifa({ idRate: 1, carrier: "TCC", totalCost: 15000 }),
      tarifa({ idRate: 2, carrier: "COORDINADORA", totalCost: 18028 }),
    ],
  };

  it("lo explica y ofrece las que sí, en el orden que llegan (más barata primero)", () => {
    render_({ recovery: sinCobertura });
    expect(screen.getByText(/ya no llega a tu dirección/i)).toBeInTheDocument();
    const opciones = screen.getAllByRole("button").filter((b) => /TCC|COORDINADORA/.test(b.textContent ?? ""));
    expect(opciones[0].textContent).toContain("TCC");
    expect(opciones[1].textContent).toContain("COORDINADORA");
  });

  it("elegir una la manda directamente, sin pasos de más", async () => {
    const { onConfirm } = render_({ recovery: sinCobertura });
    await userEvent.click(screen.getByRole("button", { name: /TCC/i }));
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ carrier: "TCC" }));
  });

  it("si no hay ninguna alternativa, se dice claro y queda la salida", () => {
    render_({ recovery: { kind: "unavailable", alternatives: [] } });
    expect(screen.getByText(/no tenemos otra transportadora/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /volver a elegir el envío/i })).toBeEnabled();
  });

  it("lo lee un lector de pantalla en cuanto aparece", () => {
    render_({ recovery: sinCobertura });
    const caja = screen.getByTestId("shipping-rate-recovery");
    expect(caja).toHaveAttribute("role", "alert");
    expect(caja).toHaveAttribute("aria-live", "polite");
  });
});
