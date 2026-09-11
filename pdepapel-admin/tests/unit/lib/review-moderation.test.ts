import { describe, expect, it } from "vitest";

import {
  PUBLIC_REVIEW_INCLUDE,
  PUBLIC_REVIEW_SELECT,
  REVIEW_REPLY_MAX_LENGTH,
  parseReviewModerationBody,
  reviewModerationData,
  reviewRevalidationPaths,
} from "@/lib/review-moderation";

const now = new Date("2026-09-08T12:00:00.000Z");

describe("parseReviewModerationBody", () => {
  it("rejects unknown actions and empty replies", () => {
    expect(() => parseReviewModerationBody({ action: "delete" })).toThrow(/acción/);
    expect(() => parseReviewModerationBody({})).toThrow(/acción/);
    expect(() => parseReviewModerationBody({ action: "reply", reply: "   " })).toThrow(/Escribe la respuesta/);
    expect(() =>
      parseReviewModerationBody({ action: "reply", reply: "x".repeat(REVIEW_REPLY_MAX_LENGTH + 1) }),
    ).toThrow(/no puede superar/);
  });

  it("trims the reply and keeps the internal note only when hiding", () => {
    expect(parseReviewModerationBody({ action: "reply", reply: "  ¡Gracias!  " })).toEqual({
      action: "reply",
      reply: "¡Gracias!",
      note: undefined,
    });
    expect(parseReviewModerationBody({ action: "hide", note: " lenguaje inadecuado " })).toEqual({
      action: "hide",
      reply: undefined,
      note: "lenguaje inadecuado",
    });
    expect(parseReviewModerationBody({ action: "publish", note: "ignored" }).note).toBeUndefined();
  });
});

describe("reviewModerationData", () => {
  it("hides with actor and note, publishes clearing the note", () => {
    expect(reviewModerationData({ action: "hide", note: "spam" }, { userId: "user_1", now })).toEqual({
      status: "HIDDEN",
      moderatedAt: now,
      moderatedBy: "user_1",
      moderationNote: "spam",
    });
    expect(reviewModerationData({ action: "publish" }, { userId: "user_1", now })).toEqual({
      status: "PUBLISHED",
      moderatedAt: now,
      moderatedBy: "user_1",
      moderationNote: null,
    });
  });

  it("writes and clears the public reply without touching the status", () => {
    const reply = reviewModerationData({ action: "reply", reply: "Gracias" }, { userId: "user_1", now });
    expect(reply).toEqual({ reply: "Gracias", repliedAt: now, repliedBy: "user_1" });
    expect(reply).not.toHaveProperty("status");
    expect(reviewModerationData({ action: "clearReply" }, { userId: "user_1", now })).toEqual({
      reply: null,
      repliedAt: null,
      repliedBy: null,
    });
  });
});

describe("public review shape", () => {
  it("never exposes the moderation note and only lists published reviews", () => {
    expect(PUBLIC_REVIEW_SELECT).not.toHaveProperty("moderationNote");
    expect(PUBLIC_REVIEW_SELECT).not.toHaveProperty("moderatedBy");
    expect(PUBLIC_REVIEW_SELECT).not.toHaveProperty("userId");
    expect(PUBLIC_REVIEW_SELECT).toMatchObject({ reply: true, repliedAt: true, rating: true });
    expect(PUBLIC_REVIEW_INCLUDE.where).toEqual({ status: "PUBLISHED" });
  });

  it("revalidates the product page when the slug is known", () => {
    expect(reviewRevalidationPaths("agenda-kawaii")).toEqual(["/producto/agenda-kawaii", "/"]);
    expect(reviewRevalidationPaths(null)).toEqual(["/"]);
  });
});
