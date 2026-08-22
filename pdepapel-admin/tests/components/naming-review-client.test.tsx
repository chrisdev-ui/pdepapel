// @vitest-environment jsdom

import { NamingReviewClient } from "@/app/(dashboard)/[storeId]/(routes)/productos/nombres/components/naming-review-client";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useParams: () => ({ storeId: "store-1" }),
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

const productCandidate = {
  id: "product-1",
  name: "Mini impresora térmica",
  sku: "IMP-GAT-ROS-S-P-001",
  brand: "Gatito",
  categoryName: "Herramientas de oficina",
  colorName: "Rosa",
  sizeName: "S",
  sizeValue: "S-P",
  designName: "Clásico",
  groupName: null,
  imageUrl: null,
};

describe("NamingReviewClient", () => {
  afterEach(cleanup);

  it("only fills and selects a proposal after the administrator requests it", async () => {
    const user = userEvent.setup();
    render(
      <NamingReviewClient
        products={[productCandidate]}
        groups={[]}
        recentChanges={[]}
      />,
    );

    const nameInput = screen.getByRole("textbox", {
      name: "Nombre propuesto para Mini impresora térmica",
    });

    expect(nameInput).toHaveValue("Mini impresora térmica");
    expect(
      screen.getByRole("button", { name: "Aplicar nombres" }),
    ).toBeDisabled();

    await user.click(
      screen.getByRole("button", { name: "Preparar propuesta" }),
    );

    expect(nameInput).toHaveValue("Mini impresora térmica Gatito");
    expect(
      screen.getByText("Propuesta lista para revisar antes de aplicarla."),
    ).toHaveAttribute("role", "status");
    expect(
      screen.getByRole("button", { name: "Aplicar 1 nombre" }),
    ).toBeEnabled();
  });

  it("explains when the safe proposal matches the current name", async () => {
    const user = userEvent.setup();
    render(
      <NamingReviewClient
        products={[
          {
            ...productCandidate,
            name: "Mini impresora térmica Gatito",
          },
        ]}
        groups={[]}
        recentChanges={[]}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Preparar propuesta" }),
    );

    expect(
      screen.getByText(
        "La propuesta segura coincide con el nombre actual. Edita solo si puedes confirmar un detalle del empaque.",
      ),
    ).toHaveAttribute("role", "status");
    expect(
      screen.getByRole("button", { name: "Aplicar nombres" }),
    ).toBeDisabled();
  });
});
