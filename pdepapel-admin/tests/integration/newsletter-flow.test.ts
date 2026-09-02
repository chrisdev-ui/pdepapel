import { NewsletterSubscriberStatus } from "@prisma/client";
import { addHours } from "date-fns";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  NEWSLETTER_CONSENT_VERSION,
  confirmNewsletterSubscription,
  requestNewsletterSubscription,
  unsubscribeFromNewsletter,
} from "@/lib/newsletter";
import { hashNewsletterToken } from "@/lib/newsletter-tokens";

import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";

describe("newsletter subscription flow with MySQL", () => {
  let fixture: InventoryFixture | undefined;
  let secondFixture: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });

  afterEach(async () => {
    if (secondFixture) {
      await deleteInventoryFixture(secondFixture);
      secondFixture = undefined;
    }
    if (fixture) {
      await deleteInventoryFixture(fixture);
      fixture = undefined;
    }
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("records explicit consent once and rate-limits repeated confirmation requests", async () => {
    fixture = await createInventoryFixture();

    const first = await requestNewsletterSubscription({
      storeId: fixture.store.id,
      email: "  Cliente@Ejemplo.com ",
      source: "/producto/agenda",
    });
    const repeated = await requestNewsletterSubscription({
      storeId: fixture.store.id,
      email: "cliente@ejemplo.COM",
      source: "/tienda",
    });
    const subscribers = await testPrisma.newsletterSubscriber.findMany({
      where: { storeId: fixture.store.id },
    });

    expect(first).toEqual({ accepted: true, confirmationSent: true });
    expect(repeated).toEqual({ accepted: true, confirmationSent: false });
    expect(subscribers).toHaveLength(1);
    expect(subscribers[0]).toMatchObject({
      emailNormalized: "cliente@ejemplo.com",
      status: NewsletterSubscriberStatus.PENDING,
      source: "/tienda",
      consentVersion: NEWSLETTER_CONSENT_VERSION,
    });
    expect(subscribers[0].confirmationTokenHash).toHaveLength(64);
    expect(subscribers[0].lastConfirmationSentAt).toBeInstanceOf(Date);
  });

  it("keeps confirmation and unsubscribe tokens isolated by store", async () => {
    fixture = await createInventoryFixture();
    secondFixture = await createInventoryFixture();
    const confirmationToken = "confirmation-token-that-is-long-enough-123";
    const unsubscribeToken = "unsubscribe-token-that-is-long-enough-456";
    const subscriber = await testPrisma.newsletterSubscriber.create({
      data: {
        storeId: fixture.store.id,
        email: "suscriptor@example.com",
        emailNormalized: "suscriptor@example.com",
        consentText: "Consentimiento de prueba",
        consentVersion: "test",
        confirmationTokenHash: hashNewsletterToken(confirmationToken),
        confirmationExpiresAt: addHours(new Date(), 1),
      },
    });

    await expect(
      confirmNewsletterSubscription(secondFixture.store.id, confirmationToken),
    ).resolves.toEqual({ status: "invalid" });
    await expect(
      confirmNewsletterSubscription(fixture.store.id, confirmationToken),
    ).resolves.toEqual({ status: "confirmed" });

    const confirmed = await testPrisma.newsletterSubscriber.findUniqueOrThrow({
      where: { id: subscriber.id },
    });
    expect(confirmed.status).toBe(NewsletterSubscriberStatus.ACTIVE);
    expect(confirmed.confirmedAt).toBeInstanceOf(Date);
    expect(confirmed.confirmationTokenHash).toBeNull();
    expect(confirmed.unsubscribeTokenHash).toHaveLength(64);

    await testPrisma.newsletterSubscriber.update({
      where: { id: subscriber.id },
      data: { unsubscribeTokenHash: hashNewsletterToken(unsubscribeToken) },
    });
    await expect(
      unsubscribeFromNewsletter(secondFixture.store.id, unsubscribeToken),
    ).resolves.toEqual({ status: "invalid" });
    await expect(
      unsubscribeFromNewsletter(fixture.store.id, unsubscribeToken),
    ).resolves.toEqual({ status: "unsubscribed" });

    await expect(
      testPrisma.newsletterSubscriber.findUniqueOrThrow({
        where: { id: subscriber.id },
      }),
    ).resolves.toMatchObject({
      status: NewsletterSubscriberStatus.UNSUBSCRIBED,
      unsubscribedAt: expect.any(Date),
    });
  });
});
