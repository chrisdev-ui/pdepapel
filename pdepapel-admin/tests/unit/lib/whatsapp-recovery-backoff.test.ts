import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({ env: {} }));
vi.mock("@/lib/prismadb", () => ({ default: {} }));

import { recoveryBackoffMs } from "@/lib/whatsapp/recovery";

const MINUTE = 60_000;

describe("recoveryBackoffMs", () => {
  it("dobla con la edad del evento: 2, 4, 8… y nunca pasa de 60 min", () => {
    expect([2, 3, 4, 7, 8, 16, 32, 64, 600, 4000].map((minutes) => recoveryBackoffMs(minutes * MINUTE) / MINUTE)).toEqual([2, 2, 4, 4, 8, 16, 32, 60, 60, 60]);
    expect(recoveryBackoffMs(0)).toBe(2 * MINUTE);
  });
});
