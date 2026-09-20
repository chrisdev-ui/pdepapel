import { OrderType } from "@prisma/client";
import { describe, expect, it } from "vitest";

import {
  SALES_CHANNELS,
  SALES_CHANNEL_LABELS,
  channelForOrderType,
} from "@/actions/get-financial-analytics";

/**
 * El reparto por canal solo sirve si los cuatro suman el total. Un `OrderType`
 * nuevo que no caiga en ningún canal dejaría plata fuera de la vista sin que
 * nada falle, así que la prueba recorre el enum entero.
 */
describe("channelForOrderType", () => {
  it("manda cada tipo de pedido a su canal", () => {
    expect(channelForOrderType(OrderType.STANDARD)).toBe("online");
    expect(channelForOrderType(OrderType.POINT_OF_SALE)).toBe("point_of_sale");
    expect(channelForOrderType(OrderType.FESTIVAL)).toBe("fair");
  });

  it("los pedidos a medida y las cotizaciones son tienda en línea, no un canal aparte", () => {
    // Son otra forma de cerrar una venta de la tienda, no otro sitio donde se
    // venda: si quedaran fuera, los canales no sumarían el total.
    expect(channelForOrderType(OrderType.CUSTOM)).toBe("online");
    expect(channelForOrderType(OrderType.QUOTATION)).toBe("online");
  });

  it("todo valor de OrderType cae en un canal conocido", () => {
    for (const type of Object.values(OrderType)) {
      expect(SALES_CHANNELS).toContain(channelForOrderType(type));
    }
  });

  it("Mercado Libre es un canal propio y no sale de OrderType", () => {
    // Las ventas de Mercado Libre viven en `MarketplaceOrder`, no en `Order`.
    expect(SALES_CHANNELS).toContain("marketplace");
    for (const type of Object.values(OrderType)) {
      expect(channelForOrderType(type)).not.toBe("marketplace");
    }
  });

  it("los cuatro canales tienen nombre para la vista", () => {
    for (const channel of SALES_CHANNELS) {
      expect(SALES_CHANNEL_LABELS[channel]).toBeTruthy();
    }
    expect(SALES_CHANNEL_LABELS.fair).toBe("Feria");
    expect(SALES_CHANNEL_LABELS.point_of_sale).toBe("Punto de venta");
  });
});
