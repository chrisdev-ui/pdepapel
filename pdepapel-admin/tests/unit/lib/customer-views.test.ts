import { describe, expect, it } from "vitest";

import {
  buildReactivationMessage,
  buildWhatsAppLink,
  computeVipThreshold,
  customerMatchesView,
  daysSince,
  getCustomerSegment,
  isPlaceholderCustomer,
  normalizePhone,
  summarizeCustomers,
  type SegmentableCustomer,
} from "@/lib/customer-views";

const NOW = new Date("2026-09-08T15:00:00Z");
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);

describe("customer-views", () => {
  it("normalizes Colombian phones for grouping and WhatsApp", () => {
    expect(normalizePhone("+57 300 123 4567")).toBe("573001234567");
    expect(normalizePhone("3001234567")).toBe("573001234567");
    expect(normalizePhone("(604) 444 5555")).toBe("6044445555");
    expect(normalizePhone("")).toBe("");
    expect(buildWhatsAppLink("300 123 4567", "hola ¿qué tal?")).toBe(
      "https://wa.me/573001234567?text=hola%20%C2%BFqu%C3%A9%20tal%3F",
    );
  });

  it("recognizes placeholder identities from counter and manual sales", () => {
    expect(isPlaceholderCustomer({ fullName: "cliente nuevo", phone: "314 282 9044" })).toBe(true);
    expect(isPlaceholderCustomer({ fullName: "Consumidor final", phone: "3001234567" })).toBe(true);
    expect(isPlaceholderCustomer({ fullName: "Ana Pérez", phone: "300 000 0000" })).toBe(true);
    expect(isPlaceholderCustomer({ fullName: "Ana Pérez", phone: "1111111111" })).toBe(true);
    expect(isPlaceholderCustomer({ fullName: "Ana Pérez", phone: "3001234567", email: "clientesvarios@gmail.com" })).toBe(true);
    expect(isPlaceholderCustomer({ fullName: "Ana Pérez", phone: "3001234567", email: "ana@example.com" })).toBe(false);
  });

  it("segments customers with the VIP threshold from active buyers", () => {
    const customers: SegmentableCustomer[] = [
      { paidOrders: 5, totalSpent: 900000, lastPaidAt: daysAgo(5) },
      { paidOrders: 3, totalSpent: 300000, lastPaidAt: daysAgo(20) },
      { paidOrders: 1, totalSpent: 50000, lastPaidAt: daysAgo(40) },
      { paidOrders: 2, totalSpent: 120000, lastPaidAt: daysAgo(30) },
      { paidOrders: 4, totalSpent: 2000000, lastPaidAt: daysAgo(200) },
      { paidOrders: 0, totalSpent: 0, lastPaidAt: null },
    ];
    const threshold = computeVipThreshold(customers, NOW);
    expect(threshold).toBe(900000);
    const segments = customers.map((customer) => getCustomerSegment(customer, threshold, NOW));
    expect(segments).toEqual(["vip", "recurrente", "ocasional", "recurrente", "inactivo", "sin-compra"]);
    expect(summarizeCustomers(segments)).toEqual({ total: 6, buyers: 5, vip: 1, inactive: 1, withoutPurchase: 1 });
  });

  it("treats a customer as inactive after 90 days and never as VIP", () => {
    const customer: SegmentableCustomer = { paidOrders: 9, totalSpent: 5000000, lastPaidAt: daysAgo(91) };
    expect(daysSince(customer.lastPaidAt, NOW)).toBe(91);
    expect(getCustomerSegment(customer, 100, NOW)).toBe("inactivo");
    expect(getCustomerSegment({ ...customer, lastPaidAt: daysAgo(90) }, 100, NOW)).toBe("vip");
    expect(computeVipThreshold([], NOW)).toBe(Infinity);
  });

  it("maps segments to views", () => {
    expect(customerMatchesView("vip", "vip")).toBe(true);
    expect(customerMatchesView("vip", "recurrentes")).toBe(false);
    expect(customerMatchesView("inactivo", "inactivos")).toBe(true);
    expect(customerMatchesView("sin-compra", "todos")).toBe(true);
    expect(customerMatchesView("sin-compra", "sin-compra")).toBe(true);
  });

  it("writes the reactivation message with the first name", () => {
    const message = buildReactivationMessage({ firstName: "Ana", storeName: "P de Papel", storeUrl: "https://papeleriapdepapel.com" });
    expect(message).toContain("¡Hola, Ana!");
    expect(message).toContain("https://papeleriapdepapel.com");
    expect(buildReactivationMessage({ firstName: " ", storeName: "P de Papel", storeUrl: "u" })).toContain("¡Hola, hola!");
  });
});
