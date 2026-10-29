// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useParams: () => ({ storeId: "store-1" }), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("axios", () => ({ default: { post: vi.fn(), patch: vi.fn() } }));

import { PresaleSection, type ProductPresaleSummary } from "@/components/products/presale-section";

afterEach(cleanup);

const campaign = {
  id: "presale-1",
  status: "ACTIVE",
  unitLimit: null,
  committedUnits: 0,
  expectedArrivalAt: null,
  expectedArrivalText: null,
  paymentMode: "DEPOSIT",
  depositType: "FIXED",
  depositValue: 30000,
  termsText: null,
  balanceDueDays: null,
} as unknown as ProductPresaleSummary;

const waitlist = <div>Lista de espera de prueba</div>;

/**
 * Sin campaña la sección solo trae la configuración: la lista de espera y
 * «Marcar anticipo recibido» aparecen al abrir la preventa. Una línea lo dice,
 * y si el producto está archivado aclara que la tienda no la muestra.
 */
describe("Preventa sin campaña abierta", () => {
  it("producto archivado: dice que hay que abrirla y que la tienda no la muestra; sin lista de espera todavía", () => {
    render(
      <PresaleSection storeId="store-1" productId="product-1" presale={null} isKit={false} isArchived>
        {waitlist}
      </PresaleSection>,
    );
    expect(screen.getByTestId("presale-open-first").textContent).toBe(
      "Abre la preventa para usar la lista de espera y registrar anticipos (con el producto archivado la tienda no la muestra).",
    );
    expect(screen.getByRole("button", { name: "Abrir preventa" })).toBeInTheDocument();
    expect(screen.queryByText("Lista de espera de prueba")).toBeNull();
  });

  it("producto a la venta: la misma línea sin la aclaración del archivado", () => {
    render(<PresaleSection storeId="store-1" productId="product-1" presale={null} isKit={false} />);
    expect(screen.getByTestId("presale-open-first").textContent).toBe("Abre la preventa para usar la lista de espera y registrar anticipos.");
  });

  it("con la campaña abierta: resumen y lista de espera, sin la línea", () => {
    render(
      <PresaleSection storeId="store-1" productId="product-1" presale={campaign} isKit={false} isArchived>
        {waitlist}
      </PresaleSection>,
    );
    expect(screen.queryByTestId("presale-open-first")).toBeNull();
    expect(screen.getByText("Lista de espera de prueba")).toBeInTheDocument();
  });
});
