import { MarketplaceOutboxAction } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prismadb", () => ({ default: {} }));

import {
  MERCADOLIBRE_PAUSED_STOCK_INCREASE_MESSAGE,
  MERCADOLIBRE_WRITES_PAUSED_MESSAGE,
  pausedWriteDecision,
} from "@/lib/mercadolibre/writes-switch";

const stock = (targetQuantity: number | null, lastSyncedStock: number | null) =>
  pausedWriteDecision({ action: MarketplaceOutboxAction.SYNC_STOCK, targetQuantity, lastSyncedStock });

/**
 * En pausa (decisión de Christian, 2026-10-30) solo pasa lo que evita vender de
 * más: bajar stock y pausar lo que quedó en cero. Subir stock, precio, activar
 * y publicar esperan; una subida retenida alerta.
 */
describe("qué deja pasar «Pausar escrituras»", () => {
  it("pausado + stock a 0 ⇒ pasa (Mercado Libre pausa la publicación sola)", () => {
    expect(stock(0, 5)).toEqual({ allow: true });
    expect(stock(0, null)).toEqual({ allow: true });
  });

  it("pausado + bajada de stock ⇒ pasa; la misma cifra también", () => {
    expect(stock(2, 5)).toEqual({ allow: true });
    expect(stock(5, 5)).toEqual({ allow: true });
  });

  it("pausado + subida de stock ⇒ retenida, con el mensaje que dispara la alerta", () => {
    expect(stock(6, 5)).toEqual({ allow: false, message: MERCADOLIBRE_PAUSED_STOCK_INCREASE_MESSAGE, stockIncrease: true });
    // Sin la última cifra enviada no se puede probar que baja: solo el cero pasa.
    expect(stock(3, null)).toMatchObject({ allow: false, stockIncrease: true });
  });

  it("pausar una publicación pasa solo si quedó en cero; activar nunca", () => {
    const status = (targetStatus: "active" | "paused", sellableQuantity: number | null) =>
      pausedWriteDecision({ action: MarketplaceOutboxAction.SYNC_LISTING_STATUS, targetStatus, sellableQuantity });
    expect(status("paused", 0)).toEqual({ allow: true });
    expect(status("paused", 4)).toMatchObject({ allow: false, message: MERCADOLIBRE_WRITES_PAUSED_MESSAGE });
    expect(status("active", 0)).toMatchObject({ allow: false });
  });

  it("precio, contenido y publicar esperan", () => {
    for (const action of [MarketplaceOutboxAction.SYNC_PRICE, MarketplaceOutboxAction.SYNC_LISTING_CONTENT, MarketplaceOutboxAction.PUBLISH_LISTING, MarketplaceOutboxAction.ACTIVATE_LISTING]) {
      expect(pausedWriteDecision({ action, sellableQuantity: 0 })).toMatchObject({ allow: false, stockIncrease: false });
    }
  });
});
