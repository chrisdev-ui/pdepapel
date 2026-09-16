import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
  updateMany: vi.fn(),
}));

vi.mock("@/lib/prismadb", () => ({
  default: {
    conversation: { findFirst: mocks.findFirst, updateMany: mocks.updateMany },
  },
}));

import { handBackToBot } from "@/lib/conversations";

const AYER = new Date("2026-09-15T20:00:00.000Z");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.updateMany.mockResolvedValue({ count: 1 });
});

describe("devolverle la conversación al bot", () => {
  it("quita la parada de 24 horas y la deja abierta", async () => {
    mocks.findFirst.mockResolvedValue({
      id: "c1", status: "NEEDS_OWNER", lastOwnerAt: AYER,
    });

    await expect(handBackToBot("store-1", "c1")).resolves.toEqual({
      ok: true, changed: true,
    });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "c1", storeId: "store-1", status: "NEEDS_OWNER", lastOwnerAt: AYER },
      data: { status: "OPEN", lastOwnerAt: null },
    });
  });

  it("pone null, no una fecha vieja: null es lo que ese campo ya significa", async () => {
    mocks.findFirst.mockResolvedValue({ id: "c1", status: "OPEN", lastOwnerAt: AYER });
    await handBackToBot("store-1", "c1");
    expect(mocks.updateMany.mock.calls[0][0].data.lastOwnerAt).toBeNull();
  });

  it("escribe condicionado a lo que leyó, para no pisar nada más nuevo", async () => {
    mocks.findFirst.mockResolvedValue({ id: "c1", status: "NEEDS_OWNER", lastOwnerAt: AYER });
    await handBackToBot("store-1", "c1");
    const { where } = mocks.updateMany.mock.calls[0][0];
    expect(where.status).toBe("NEEDS_OWNER");
    expect(where.lastOwnerAt).toBe(AYER);
  });

  it("si cambió entre la lectura y la escritura, avisa y no pisa", async () => {
    mocks.findFirst.mockResolvedValue({ id: "c1", status: "NEEDS_OWNER", lastOwnerAt: AYER });
    mocks.updateMany.mockResolvedValue({ count: 0 });

    await expect(handBackToBot("store-1", "c1")).resolves.toEqual({
      ok: false, reason: "conflict",
    });
  });

  it("tocar el botón dos veces no es un error: la segunda no hace nada", async () => {
    mocks.findFirst.mockResolvedValue({ id: "c1", status: "OPEN", lastOwnerAt: null });

    await expect(handBackToBot("store-1", "c1")).resolves.toEqual({
      ok: true, changed: false,
    });
    // Ni siquiera escribe: así una segunda pulsada no puede dar «conflicto»
    // solo porque MySQL no cuente como afectada una fila que no cambió.
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("una conversación de otra tienda no existe para esta", async () => {
    mocks.findFirst.mockResolvedValue(null);
    await expect(handBackToBot("store-1", "c1")).resolves.toEqual({
      ok: false, reason: "not_found",
    });
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("siempre busca dentro de la tienda que pregunta", async () => {
    mocks.findFirst.mockResolvedValue(null);
    await handBackToBot("store-1", "c1");
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "c1", storeId: "store-1" } }),
    );
  });

  it("no manda ningún mensaje: aquí no hay envío que hacer", async () => {
    mocks.findFirst.mockResolvedValue({ id: "c1", status: "NEEDS_OWNER", lastOwnerAt: AYER });
    await handBackToBot("store-1", "c1");
    // Lo único que toca es la fila de la conversación.
    expect(Object.keys(mocks.updateMany.mock.calls[0][0].data).sort()).toEqual([
      "lastOwnerAt", "status",
    ]);
  });
});
