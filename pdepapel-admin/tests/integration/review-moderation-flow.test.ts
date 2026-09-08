import { ReviewStatus } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  PUBLIC_REVIEW_INCLUDE,
  moderateReview,
  parseReviewModerationBody,
} from "@/lib/review-moderation";

import {
  createInventoryFixture,
  deleteInventoryFixture,
  testPrisma,
  type InventoryFixture,
} from "./helpers/database";

describe("review moderation flow with MySQL", () => {
  let fixture: InventoryFixture | undefined;
  let otherStore: InventoryFixture | undefined;

  beforeAll(async () => {
    await testPrisma.$connect();
  });

  afterEach(async () => {
    for (const current of [otherStore, fixture]) {
      if (!current) continue;
      await testPrisma.review.deleteMany({ where: { storeId: current.store.id } });
      await deleteInventoryFixture(current);
    }
    otherStore = undefined;
    fixture = undefined;
  });

  afterAll(async () => {
    await testPrisma.$disconnect();
  });

  it("hides, replies and republishes a review while the storefront only sees published ones", async () => {
    fixture = await createInventoryFixture();
    const review = await testPrisma.review.create({
      data: {
        storeId: fixture.store.id,
        productId: fixture.component.id,
        userId: "user_customer",
        name: "Laura",
        rating: 2,
        comment: "El empaque llegó abierto.",
      },
    });
    expect(review.status).toBe(ReviewStatus.PUBLISHED);

    const hidden = await moderateReview(testPrisma, {
      storeId: fixture.store.id,
      reviewId: review.id,
      userId: "user_owner",
      input: parseReviewModerationBody({ action: "hide", note: "Datos personales" }),
    });
    expect(hidden.status).toBe(ReviewStatus.HIDDEN);
    expect(hidden.moderationNote).toBe("Datos personales");
    expect(hidden.product.slug).toBe(fixture.component.slug);

    const storefrontWhileHidden = await testPrisma.product.findUniqueOrThrow({
      where: { id: fixture.component.id },
      include: { reviews: PUBLIC_REVIEW_INCLUDE },
    });
    expect(storefrontWhileHidden.reviews).toHaveLength(0);

    const replied = await moderateReview(testPrisma, {
      storeId: fixture.store.id,
      reviewId: review.id,
      userId: "user_owner",
      input: parseReviewModerationBody({ action: "reply", reply: "Lo sentimos; te escribimos por WhatsApp." }),
    });
    expect(replied.status).toBe(ReviewStatus.HIDDEN);
    expect(replied.reply).toBe("Lo sentimos; te escribimos por WhatsApp.");

    await moderateReview(testPrisma, {
      storeId: fixture.store.id,
      reviewId: review.id,
      userId: "user_owner",
      input: parseReviewModerationBody({ action: "publish" }),
    });

    const storefront = await testPrisma.product.findUniqueOrThrow({
      where: { id: fixture.component.id },
      include: { reviews: PUBLIC_REVIEW_INCLUDE },
    });
    expect(storefront.reviews).toHaveLength(1);
    expect(storefront.reviews[0]).toMatchObject({
      id: review.id,
      rating: 2,
      reply: "Lo sentimos; te escribimos por WhatsApp.",
    });
    expect(storefront.reviews[0]).not.toHaveProperty("moderationNote");

    const stored = await testPrisma.review.findUniqueOrThrow({ where: { id: review.id } });
    expect(stored.moderationNote).toBeNull();
    expect(stored.rating).toBe(2);
    expect(stored.comment).toBe("El empaque llegó abierto.");
  });

  it("refuses to moderate a review that belongs to another store", async () => {
    fixture = await createInventoryFixture();
    otherStore = await createInventoryFixture();
    const review = await testPrisma.review.create({
      data: {
        storeId: otherStore.store.id,
        productId: otherStore.component.id,
        userId: "user_customer",
        name: "Ana",
        rating: 5,
        comment: "Perfecto",
      },
    });

    await expect(
      moderateReview(testPrisma, {
        storeId: fixture.store.id,
        reviewId: review.id,
        userId: "user_owner",
        input: { action: "hide" },
      }),
    ).rejects.toThrow(/no encontrada/);

    const untouched = await testPrisma.review.findUniqueOrThrow({ where: { id: review.id } });
    expect(untouched.status).toBe(ReviewStatus.PUBLISHED);
  });
});
