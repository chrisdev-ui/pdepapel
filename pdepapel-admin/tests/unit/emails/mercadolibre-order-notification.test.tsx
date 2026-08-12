import { render } from "@react-email/render";
import { describe, expect, it } from "vitest";

import { MercadoLibreOrderNotification } from "@/emails/mercadolibre-order-notification";

const notification = {
  buyerName: "Ana Pérez",
  inventoryStatus: "DECREMENTED",
  orderNumber: "2000017890359944",
  orderSummary: "• 1 × Termo Owala (TERMO-OWALA-01)",
  orderUrl: "https://admin.example.com/store/mercadolibre?order=order-id",
  paidAt: "12 de agosto de 2026, 10:29 p. m.",
};

describe("Mercado Libre order notification email", () => {
  it("alerts immediately without inventing a net amount while settlement is pending", async () => {
    const html = await render(
      <MercadoLibreOrderNotification {...notification} netAmount={null} />,
    );

    expect(html).toContain("Venta pagada y registrada");
    expect(html).toContain("Liquidación neta: pendiente de Mercado Libre");
    expect(html).toContain("Mercado Libre todavía no publicó el valor neto");
    expect(html).not.toContain("Neto de la venta: $");
  });

  it("shows the exact net only after Mercado Libre publishes it", async () => {
    const html = await render(
      <MercadoLibreOrderNotification {...notification} netAmount="$ 46.457" />,
    );

    expect(html).toContain("Neto de la venta: $ 46.457");
    expect(html).not.toContain("todavía no publicó el valor neto");
  });
});
