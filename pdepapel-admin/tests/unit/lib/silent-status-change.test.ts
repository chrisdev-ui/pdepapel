import { describe, expect, it } from "vitest";

import {
  isSilentChangeMilestone,
  parseNotifyCustomer,
  silentChangeDedupeKey,
  silentChangeLabel,
  silentChangeMilestone,
} from "@/lib/silent-status-change";

describe("cambiar estado sin avisar", () => {
  it("notifyCustomer: ausente es avisar, solo un booleano vale", () => {
    expect(parseNotifyCustomer({})).toBe(true);
    expect(parseNotifyCustomer({ notifyCustomer: undefined })).toBe(true);
    expect(parseNotifyCustomer({ notifyCustomer: true })).toBe(true);
    expect(parseNotifyCustomer({ notifyCustomer: false })).toBe(false);
    expect(parseNotifyCustomer({ notifyCustomer: "false" })).toBeNull();
    expect(parseNotifyCustomer({ notifyCustomer: 0 })).toBeNull();
    expect(parseNotifyCustomer({ notifyCustomer: null })).toBeNull();
    expect(parseNotifyCustomer(null)).toBe(true);
  });

  it("el hito cabe en VarChar(40) y la clave en 191", () => {
    expect(silentChangeMilestone("PAID")).toBe("estado:PAID");
    expect(silentChangeMilestone("OutForDelivery")).toBe("estado:OutForDelivery");
    expect(silentChangeMilestone("X".repeat(80) as never)).toHaveLength(40);
    expect(silentChangeDedupeKey("pedido-1", 1700000000000, 0.123456789)).toMatch(/^silent:pedido-1:1700000000000:[a-z0-9]{6}$/);
    expect(silentChangeDedupeKey("p".repeat(300)).length).toBeLessThanOrEqual(191);
    expect(silentChangeDedupeKey("pedido-1", 1, 0.5)).toMatch(/:[a-z0-9]{6}$/);
  });

  it("la etiqueta usa los nombres del panel para el pedido y para el envío", () => {
    expect(isSilentChangeMilestone("estado:PAID")).toBe(true);
    expect(isSilentChangeMilestone("entregado")).toBe(false);
    expect(silentChangeLabel("estado:PAID")).toBe("Cambio de estado sin avisar (Pagado)");
    expect(silentChangeLabel("estado:CANCELLED")).toBe("Cambio de estado sin avisar (Cancelado)");
    expect(silentChangeLabel("estado:Delivered")).toBe("Cambio de estado sin avisar (Envío: Entregado)");
    expect(silentChangeLabel("estado:Desconocido")).toBe("Cambio de estado sin avisar (Desconocido)");
  });
});
