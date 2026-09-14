import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ findFirst: vi.fn() }));
vi.mock("@/lib/env.mjs", () => ({ env: {} }));
vi.mock("@/lib/prismadb", () => ({
  default: { order: { findFirst: mocks.findFirst } },
}));

import { getLastOrderTimestamp } from "@/lib/utils";

describe("freno de «una orden cada pocos minutos»", () => {
  beforeEach(() => {
    mocks.findFirst.mockReset();
    mocks.findFirst.mockResolvedValue(null);
  });

  const whereOf = () => mocks.findFirst.mock.calls[0][0].where;

  it("una invitada solo se frena con SUS pedidos", async () => {
    // `{ userId: null }` casaba con todos los pedidos de invitadas: una compra
    // dejaba fuera a todas las demás durante tres minutos.
    await getLastOrderTimestamp(null, "invitada-1", "store-1");

    expect(whereOf().OR).toEqual([{ guestId: "invitada-1" }]);
    expect(JSON.stringify(whereOf())).not.toContain('"userId":null');
  });

  it("una clienta con sesión se frena con los suyos", async () => {
    await getLastOrderTimestamp("user_1", null, "store-1");

    expect(whereOf().OR).toEqual([{ userId: "user_1" }]);
  });

  it("con sesión e invitada cuentan ambos", async () => {
    await getLastOrderTimestamp("user_1", "invitada-1", "store-1");

    expect(whereOf().OR).toEqual([
      { userId: "user_1" },
      { guestId: "invitada-1" },
    ]);
  });

  it("sin identificador no hay a quién frenar y no se consulta nada", async () => {
    await expect(
      getLastOrderTimestamp(null, null, "store-1"),
    ).resolves.toBeNull();

    expect(mocks.findFirst).not.toHaveBeenCalled();
  });
});
