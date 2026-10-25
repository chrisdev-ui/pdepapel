import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

import { isDeadlock, withDeadlockRetry } from "@/lib/deadlock-retry";

const known = (code: string, meta?: Record<string, unknown>) => new Prisma.PrismaClientKnownRequestError("x", { code, clientVersion: "6", meta });

describe("reintento por deadlock", () => {
  it("reconoce el 1213 de MySQL que llega como P2010 de $executeRaw (conciliación del sandbox) y el P2034", () => {
    expect(isDeadlock(known("P2010", { code: "1213" }))).toBe(true);
    expect(isDeadlock(known("P2034"))).toBe(true);
    expect(isDeadlock(known("P2010", { code: "1062" }))).toBe(false);
    expect(isDeadlock(new Error("1213"))).toBe(false);
  });

  it("repite la transacción entera tras un deadlock y no repite otros errores", async () => {
    const work = vi.fn().mockRejectedValueOnce(known("P2010", { code: "1213" })).mockResolvedValueOnce("ok");
    await expect(withDeadlockRetry(work)).resolves.toBe("ok");
    expect(work).toHaveBeenCalledTimes(2);

    const other = vi.fn().mockRejectedValue(new Error("otra cosa"));
    await expect(withDeadlockRetry(other)).rejects.toThrow("otra cosa");
    expect(other).toHaveBeenCalledTimes(1);
  });
});
