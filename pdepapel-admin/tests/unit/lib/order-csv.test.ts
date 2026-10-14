import { OrderStatus, PaymentMethod, ShippingStatus } from "@prisma/client";
import { describe, expect, it } from "vitest";

import { Models, ModelsColumns } from "@/constants";
import { orderCsvValues } from "@/lib/order-csv";

const order = {
  orderNumber: "ORD-CSV-1",
  phone: "3000000001",
  address: "Calle 1 # 2-3",
  city: "Medellín",
  total: 45000,
  status: OrderStatus.PAID,
  createdAt: new Date("2026-10-14T18:30:00Z"),
  orderItems: [
    { quantity: 2, name: "Lápiz (línea)", product: { name: "Lápiz HB" } },
    { quantity: 1, name: "Regla vieja", product: null },
  ],
  payment: { method: PaymentMethod.Bold },
  shipping: { status: ShippingStatus.InTransit },
};

describe("exportación de Pedidos a CSV", () => {
  it("un pedido completo llena todas las columnas de la exportación", () => {
    const values = orderCsvValues(order);
    const columns = Object.keys(ModelsColumns[Models.Orders]);
    expect(Object.keys(values).sort()).toEqual([...columns].sort());
    for (const column of columns) expect(String(values[column as keyof typeof values]).trim(), column).not.toBe("");
  });

  it("cada columna con el dato que le corresponde", () => {
    expect(orderCsvValues(order)).toEqual({
      orderNumber: "ORD-CSV-1",
      products: "2 × Lápiz HB; 1 × Regla vieja",
      phone: "3000000001",
      address: "Calle 1 # 2-3, Medellín",
      paymentMethod: "Pago en línea (Tarjeta de Crédito, Débito, PSE, Nequi)",
      totalPrice: 45000,
      status: "Pagada",
      shippingStatus: "En tránsito",
      createdAt: "2026-10-14 13:30",
    });
  });

  it("una venta sin envío lo dice en vez de dejar la columna vacía", () => {
    expect(orderCsvValues({ ...order, shipping: null }).shippingStatus).toBe("Sin envío");
  });
});
