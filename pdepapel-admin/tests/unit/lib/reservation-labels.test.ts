import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({ env: { NODE_ENV: "development" } }));
vi.mock("@/lib/prismadb", () => ({ default: {} }));
vi.mock("@/lib/resend", () => ({ resend: { emails: { send: vi.fn() } } }));
vi.mock("@/lib/store-email-settings", () => ({ getAdminNotificationRecipients: vi.fn() }));

import { expiryLabel, reservedSuffix } from "@/lib/reservation-labels";
import { renderDigest } from "@/lib/stock-reservations-job";

describe("etiquetas de reservas", () => {
  it("el sufijo de reservados solo aparece cuando hay", () => {
    expect(reservedSuffix(0)).toBe("");
    expect(reservedSuffix(null)).toBe("");
    expect(reservedSuffix(1)).toBe(" · 1 reservado");
    expect(reservedSuffix(3)).toBe(" · 3 reservados");
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
});
