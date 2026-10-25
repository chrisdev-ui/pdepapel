import { describe, expect, it, vi } from "vitest";

import { deleteExpiredPendingNewsletterSignups, NEWSLETTER_PENDING_RETENTION_DAYS } from "@/lib/newsletter-retention";

const NOW = new Date("2026-10-25T13:22:00.000Z");
const db = () => {
  const newsletterSubscriber = { deleteMany: vi.fn(async () => ({ count: 87 })), count: vi.fn(async () => 87), updateMany: vi.fn() };
  return { newsletterSubscriber, coupon: {}, order: {} } as never as Parameters<typeof deleteExpiredPendingNewsletterSignups>[0] & { newsletterSubscriber: typeof newsletterSubscriber };
};

describe("altas pendientes del boletín", () => {
  it("borra solo las PENDIENTES creadas hace más de 7 días y sin un enlace vigente", async () => {
    expect(NEWSLETTER_PENDING_RETENTION_DAYS).toBe(7);
    const client = db();
    const result = await deleteExpiredPendingNewsletterSignups(client, { now: NOW });
    expect(client.newsletterSubscriber.deleteMany).toHaveBeenCalledWith({
      where: {
        status: "PENDING",
        createdAt: { lt: new Date("2026-10-18T13:22:00.000Z") },
        OR: [{ confirmationExpiresAt: null }, { confirmationExpiresAt: { lt: NOW } }],
      },
    });
    expect(result).toEqual({ matched: 87, deleted: 87, cutoff: new Date("2026-10-18T13:22:00.000Z"), olderThanDays: 7 });
    expect(client.newsletterSubscriber.updateMany).not.toHaveBeenCalled();
  });

  it("el ensayo solo cuenta, y la tienda acota", async () => {
    const client = db();
    const result = await deleteExpiredPendingNewsletterSignups(client, { now: NOW, storeId: "s", dryRun: true });
    expect(client.newsletterSubscriber.deleteMany).not.toHaveBeenCalled();
    expect(client.newsletterSubscriber.count).toHaveBeenCalledWith({ where: expect.objectContaining({ status: "PENDING", storeId: "s" }) });
    expect(result).toMatchObject({ matched: 87, deleted: 0 });
  });
});
