import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: { conversation: { findUnique: mocks.findUnique, updateMany: mocks.updateMany } },
}));

import { bumpLastOwnerAt, markOwnerActivity } from "@/lib/whatsapp/owner-activity";

const T0 = new Date("2026-09-24T23:10:07.000Z");
const T1 = new Date("2026-09-24T23:10:15.000Z");

/**
 * La marca de «Paula acaba de escribir», escrita desde el webhook al recibir
 * el eco y no solo cuando la fila lo procesa. La ráfaga del 2026-09-24
 * (conversación 98ee6263) dejó el eco esperando turno detrás de cuatro
 * mensajes de la clienta; el bot releyó `lastOwnerAt` justo antes de enviar,
 * como debe, y estaba vacío.
 */
describe("bumpLastOwnerAt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("es una sola sentencia con la guarda en el where: nunca mueve la marca hacia atrás", async () => {
    await bumpLastOwnerAt("conv-1", T1);
    expect(mocks.updateMany).toHaveBeenCalledTimes(1);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "conv-1", OR: [{ lastOwnerAt: null }, { lastOwnerAt: { lt: T1 } }] },
      data: { lastOwnerAt: T1 },
    });
  });

  it("devuelve true cuando escribió y false cuando lo guardado ya era más reciente", async () => {
    await expect(bumpLastOwnerAt("conv-1", T1)).resolves.toBe(true);
    // Un reintento tardío de Meta con un eco viejo: la base no cambia nada.
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(bumpLastOwnerAt("conv-1", T0)).resolves.toBe(false);
  });
});

describe("markOwnerActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updateMany.mockResolvedValue({ count: 1 });
  });

  it("busca primero por BSUID, la identidad que no se pierde", async () => {
    mocks.findUnique.mockResolvedValueOnce({ id: "conv-b" });
    await expect(
      markOwnerActivity("store-1", { phone: "573003179332", bsuid: "CO.1545049727288623" }, T1),
    ).resolves.toBe("stamped");
    expect(mocks.findUnique).toHaveBeenCalledTimes(1);
    expect(mocks.findUnique.mock.calls[0][0].where).toEqual({
      storeId_channel_bsuid: { storeId: "store-1", channel: "WHATSAPP", bsuid: "CO.1545049727288623" },
    });
    expect(mocks.updateMany.mock.calls[0][0].where.id).toBe("conv-b");
  });

  it("cae al teléfono cuando no hay fila por BSUID", async () => {
    mocks.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "conv-p" });
    await expect(
      markOwnerActivity("store-1", { phone: "573003179332", bsuid: "CO.x" }, T1),
    ).resolves.toBe("stamped");
    expect(mocks.findUnique.mock.calls[1][0].where).toEqual({
      storeId_channel_phone: { storeId: "store-1", channel: "WHATSAPP", phone: "573003179332" },
    });
  });

  it("no crea conversaciones: si no existe, no hay bot que frenar", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(
      markOwnerActivity("store-1", { phone: "573003179332", bsuid: null }, T1),
    ).resolves.toBe("no_conversation");
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("dice «unchanged» cuando la guarda no dejó pasar un eco más viejo", async () => {
    mocks.findUnique.mockResolvedValueOnce({ id: "conv-1" });
    mocks.updateMany.mockResolvedValue({ count: 0 });
    await expect(markOwnerActivity("store-1", { phone: null, bsuid: "CO.x" }, T0)).resolves.toBe(
      "unchanged",
    );
  });
});
