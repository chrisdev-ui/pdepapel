// @vitest-environment jsdom
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { TaxChannelSummary } from "@/app/(dashboard)/[storeId]/(routes)/reportes-tributarios/components/channel-summary";
import { summarizeTaxSalesByChannel } from "@/lib/tax-report-channels";

describe("TaxChannelSummary", () => {
  afterEach(cleanup);

  it("muestra punto de venta y ferias en líneas separadas y el total presencial", () => {
    render(
      <TaxChannelSummary
        channels={summarizeTaxSalesByChannel([
          { channel: "Punto de venta", totalAmount: 15000 },
          { channel: "Feria", totalAmount: 20000 },
          { channel: "Tienda en línea", totalAmount: 30000 },
        ])}
      />,
    );
    const items = within(screen.getByRole("list", { name: "Ventas por canal" })).getAllByRole("listitem").map((item) => item.textContent);
    expect(items[0]).toMatch(/^Tienda en línea · 1 venta.*30\.000/);
    expect(items[1]).toMatch(/^Punto de venta · 1 venta.*15\.000/);
    expect(items[2]).toMatch(/^Ferias · 1 venta.*20\.000/);
    expect(items[3]).toMatch(/^Total presencial \(punto de venta \+ ferias\) · 2 ventas.*35\.000/);
    expect(items[4]).toMatch(/^Mercado Libre · 0 ventas/);
  });
});
