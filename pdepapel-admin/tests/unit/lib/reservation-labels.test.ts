import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({ env: { NODE_ENV: "development" } }));
vi.mock("@/lib/prismadb", () => ({ default: {} }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: vi.fn() } } }));
vi.mock("@/lib/store-email-settings", () => ({ getAdminNotificationRecipients: vi.fn() }));

import { expiryLabel, reservableLine, reservedSuffix } from "@/lib/reservation-labels";
import { describeLines, renderDigest } from "@/lib/stock-reservations-job";

describe("etiquetas de reservas", () => {
  it("el sufijo de reservados solo aparece cuando hay", () => {
    expect(reservedSuffix(0)).toBe("");
    expect(reservedSuffix(null)).toBe("");
    expect(reservedSuffix(1)).toBe(" · 1 reservado");
    expect(reservedSuffix(3)).toBe(" · 3 reservados");
  });

  it("la línea de la hoja dice lo reservable y, si hay reservas, el stock", () => {
    expect(reservableLine(20, 0)).toBe("Disponibles para reservar: 20");
    expect(reservableLine(10, 2)).toBe("Disponibles para reservar: 8 · stock 10 · 2 reservados");
    expect(reservableLine(5, 1)).toBe("Disponibles para reservar: 4 · stock 5 · 1 reservado");
    expect(reservableLine(2, 2)).toBe("No hay unidades disponibles para reservar · stock 2 · 2 reservados");
    expect(reservableLine(0, 0)).toBe("No hay unidades disponibles para reservar.");
  });

  it("la cuenta regresiva usa los días de Bogotá", () => {
    const now = new Date("2026-10-14T15:00:00Z");
    expect(expiryLabel("2026-10-15T04:00:00Z", now)).toBe("vence hoy");
    expect(expiryLabel("2026-10-14T14:00:00Z", now)).toBe("venció hoy");
    expect(expiryLabel("2026-10-15T06:00:00Z", now)).toBe("vence mañana");
    expect(expiryLabel("2026-10-17T15:00:00Z", now)).toBe("vence en 3 días");
    expect(expiryLabel("2026-10-13T15:00:00Z", now)).toBe("venció ayer");
    expect(expiryLabel("2026-10-10T15:00:00Z", now)).toBe("venció hace 4 días");
  });
});

describe("resumen diario", () => {
  const row = (name: string, order?: string) => ({ quantity: 1, customerName: "Laura", expiresAt: new Date(), product: { name }, order: order ? { orderNumber: order } : null });

  it("sin nada que contar no hay correo", () => {
    expect(renderDigest({ expiringToday: [], expired: [], convertedUnpaid: [], unbacked: [] })).toBeNull();
  });

  it("solo lleva las secciones con filas", () => {
    const text = renderDigest({ expiringToday: [row("Agenda")], expired: [], convertedUnpaid: [row("Sobre", "ORD-1")], unbacked: [] })!;
    expect(text).toContain("Vencen hoy (1):\n• Agenda × 1 — Laura");
    expect(text).toContain("Convertidos en pedido y sin pagar (1):\n• Sobre × 1 — Laura (pedido ORD-1)");
    expect(text).not.toContain("Sin respaldo");
    expect(text).toContain("en Reservas");
  });

  it("«Vencen mañana» va después de «Vencen hoy» y una reserva con varios productos los nombra todos", () => {
    const multi = { quantity: null, product: null, customerName: "Sofía", expiresAt: new Date(), order: null, items: [{ quantity: 2, product: { name: "Libreta" } }, { quantity: 1, product: { name: "Washi tape" } }] };
    const text = renderDigest({ expiringToday: [row("Agenda")], expiringTomorrow: [multi], expired: [], convertedUnpaid: [], unbacked: [] })!;
    expect(text.indexOf("Vencen hoy")).toBeLessThan(text.indexOf("Vencen mañana"));
    expect(text).toContain("• Libreta × 2, Washi tape × 1 — Sofía");
    expect(renderDigest({ expiringToday: [], expiringTomorrow: [multi], expired: [], convertedUnpaid: [], unbacked: [] })).toContain("Vencen mañana (1)");
  });

  it("una reserva anterior a los ítems se describe por su encabezado", () => {
    expect(describeLines({ quantity: 3, product: { name: "Agenda" }, items: [] })).toBe("Agenda × 3");
    expect(describeLines({ quantity: null, product: null, items: [] })).toBe("");
  });
});
