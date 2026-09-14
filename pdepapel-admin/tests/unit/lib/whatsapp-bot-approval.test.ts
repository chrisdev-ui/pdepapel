import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ env: {} as { WHATSAPP_BOT_APPROVER_USER_ID?: string } }));
vi.mock("@/lib/env.mjs", () => ({ env: mocks.env }));

import {
  canApproveBotReplies,
  getBotReplyApproverUserId,
} from "@/lib/whatsapp/bot-approval";

const PAULA = "user_2YuMElx5guOjtnY3RT0vXi9UA3b";

afterEach(() => {
  delete mocks.env.WHATSAPP_BOT_APPROVER_USER_ID;
});

describe("canApproveBotReplies", () => {
  it("sin la variable, aprueba cualquier dueña: es como funcionaba antes", () => {
    expect(getBotReplyApproverUserId()).toBeNull();
    expect(canApproveBotReplies("cualquiera")).toBe(true);
  });

  it("con la variable, solo esa persona", () => {
    mocks.env.WHATSAPP_BOT_APPROVER_USER_ID = PAULA;

    expect(canApproveBotReplies(PAULA)).toBe(true);
    expect(canApproveBotReplies("user_otro")).toBe(false);
    expect(canApproveBotReplies(null)).toBe(false);
    expect(canApproveBotReplies(undefined)).toBe(false);
  });

  it("una variable en blanco no bloquea a nadie", () => {
    // Un valor con solo espacios sería un candado que nadie puede abrir.
    mocks.env.WHATSAPP_BOT_APPROVER_USER_ID = "   ";
    expect(canApproveBotReplies("cualquiera")).toBe(true);
  });
});
