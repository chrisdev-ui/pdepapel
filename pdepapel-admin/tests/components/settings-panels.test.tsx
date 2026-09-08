// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { PaymentsPanel } from "@/app/(dashboard)/[storeId]/(routes)/configuracion/components/payments-panel";
import { CONFIGURED, MISSING, StatusCard } from "@/app/(dashboard)/[storeId]/(routes)/configuracion/components/status-cards";
import { CreditCard } from "lucide-react";

describe("settings panels", () => {
  afterEach(() => {
    cleanup();
    delete process.env.BOLD_SECRET_KEY;
    delete process.env.WOMPI_API_KEY;
    delete process.env.WOMPI_INTEGRITY_KEY;
    delete process.env.WOMPI_EVENTS_KEY;
  });

  it("renders a status card with facts and an internal action", () => {
    render(
      <StatusCard
        icon={CreditCard}
        title="Proveedor"
        description="Descripción"
        status={CONFIGURED}
        facts={[{ label: "Ambiente", value: "production" }]}
        action={{ label: "Ir", href: "/store-1/pedidos" }}
      />,
    );
    expect(screen.getByText("Proveedor")).toBeInTheDocument();
    expect(screen.getByText("Configurado")).toBeInTheDocument();
    expect(screen.getByText("production")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Ir" })).toHaveAttribute("href", "/store-1/pedidos");
  });

  it("reports payment providers from the presence of their variables without printing them", () => {
    process.env.BOLD_SECRET_KEY = "secret-value-never-shown";
    render(<PaymentsPanel storeId="store-1" />);
    expect(screen.getByText("Bold · pago en línea")).toBeInTheDocument();
    expect(screen.getAllByText("Configurado")).toHaveLength(1);
    expect(screen.getByText("Opcional")).toBeInTheDocument();
    expect(screen.queryByText(/secret-value-never-shown/)).toBeNull();
    expect(screen.getByRole("link", { name: /transferencias por verificar/ })).toHaveAttribute("href", "/store-1/pedidos?vista=por-verificar");
  });

  it("marks Bold as missing when its key is absent", () => {
    render(<PaymentsPanel storeId="store-1" />);
    expect(screen.getByText(MISSING.label)).toBeInTheDocument();
  });
});
