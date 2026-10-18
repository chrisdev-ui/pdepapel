import { describe, expect, it, vi } from "vitest";

import { assertReadOnlyUser } from "@/scripts/lib/read-only-user";

const dbAs = (who: string) => ({ $queryRawUnsafe: vi.fn().mockResolvedValue([{ who }]) }) as never;

describe("assertReadOnlyUser", () => {
  it("deja pasar a pdepapel_ro", async () => {
    await expect(assertReadOnlyUser(dbAs("pdepapel_ro@%"), "mysql://x@host:1/railway")).resolves.toBeUndefined();
  });

  it("frena a cualquier otro usuario de producción", async () => {
    await expect(assertReadOnlyUser(dbAs("root@%"), "mysql://x@host:1/railway")).rejects.toThrow(/pdepapel_ro/);
    await expect(assertReadOnlyUser(dbAs("pdepapel_rw@%"), "mysql://x@host:1/railway")).rejects.toThrow(/pdepapel_ro/);
  });

  it("la base local de pruebas no consulta el usuario", async () => {
    const db = dbAs("root@%");
    await expect(assertReadOnlyUser(db, "mysql://root@localhost:3307/pdepapel_test")).resolves.toBeUndefined();
    expect((db as unknown as { $queryRawUnsafe: ReturnType<typeof vi.fn> }).$queryRawUnsafe).not.toHaveBeenCalled();
  });
});
