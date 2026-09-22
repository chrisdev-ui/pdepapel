import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  convFindFirst: vi.fn(),
  ignFindFirst: vi.fn(),
  ignCreate: vi.fn(),
  ignUpdate: vi.fn(),
  ignDeleteMany: vi.fn(),
  ignAggregate: vi.fn(),
}));

vi.mock("@/lib/env.mjs", () => ({ env: {} }));
vi.mock("@/lib/prismadb", () => ({
  default: {
    conversation: { findFirst: db.convFindFirst },
    ignoredContact: {
      findFirst: db.ignFindFirst,
      create: db.ignCreate,
      update: db.ignUpdate,
      deleteMany: db.ignDeleteMany,
      aggregate: db.ignAggregate,
    },
  },
}));

import {
  ignoreConversationContact,
  unignoreConversationContact,
} from "@/lib/conversations";

const STORE = "store-1";
const CONV = "conv-1";
const REASON = "manda decenas de mensajes al día y no es una clienta";

describe("ignorar el contacto de una conversación", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.ignFindFirst.mockResolvedValue(null);
    db.ignCreate.mockResolvedValue({ id: "ign-1" });
    db.ignUpdate.mockResolvedValue({ id: "ign-1" });
    db.ignDeleteMany.mockResolvedValue({ count: 1 });
    db.ignAggregate.mockResolvedValue({ _sum: { skippedCount: 0 } });
  });

  it("guarda las DOS identidades cuando la conversación las tiene", async () => {
    db.convFindFirst.mockResolvedValue({ phone: "8618858869228", bsuid: "CN.1377520137782797" });

    const result = await ignoreConversationContact(STORE, CONV, { reason: REASON, userId: "user-1" });

    expect(result).toEqual({ ok: true, phone: "8618858869228", bsuid: "CN.1377520137782797" });
    // Las dos en una sola fila: así lo tapa venga por el teléfono o por el BSUID.
    expect(db.ignCreate).toHaveBeenCalledWith({
      data: { storeId: STORE, phone: "8618858869228", bsuid: "CN.1377520137782797", reason: REASON, createdByUserId: "user-1" },
    });
  });

  it("sirve con una sola identidad", async () => {
    db.convFindFirst.mockResolvedValue({ phone: null, bsuid: "CO.2465629583926901" });
    const result = await ignoreConversationContact(STORE, CONV, { reason: REASON, userId: "user-1" });
    expect(result).toMatchObject({ ok: true, phone: null, bsuid: "CO.2465629583926901" });
  });

  /**
   * Sin teléfono ni BSUID no hay nada exacto que guardar, y lo único que
   * quedaría sería adivinar por nombre: justo lo que silenciaría a otra.
   */
  it("se niega cuando no hay ninguna identidad exacta", async () => {
    db.convFindFirst.mockResolvedValue({ phone: null, bsuid: null });
    const result = await ignoreConversationContact(STORE, CONV, { reason: REASON, userId: "user-1" });
    expect(result).toEqual({ ok: false, reason: "no_identity" });
    expect(db.ignCreate).not.toHaveBeenCalled();
  });

  it("una conversación de otra tienda no existe aquí", async () => {
    db.convFindFirst.mockResolvedValue(null);
    const result = await ignoreConversationContact(STORE, CONV, { reason: REASON, userId: "user-1" });
    expect(result).toEqual({ ok: false, reason: "not_found" });
    // La consulta va acotada a la tienda: no se puede ignorar desde fuera.
    expect(db.convFindFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: CONV, storeId: STORE } }));
  });

  /** Ya estaba por el teléfono y ahora además se conoce el BSUID: se completa. */
  it("completa la fila existente en vez de crear una segunda", async () => {
    db.convFindFirst.mockResolvedValue({ phone: "8618858869228", bsuid: "CN.1377520137782797" });
    db.ignFindFirst.mockResolvedValue({ id: "ign-viejo" });

    await ignoreConversationContact(STORE, CONV, { reason: REASON, userId: "user-2" });

    expect(db.ignCreate).not.toHaveBeenCalled();
    expect(db.ignUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "ign-viejo" },
        data: expect.objectContaining({ bsuid: "CN.1377520137782797", createdByUserId: "user-2" }),
      }),
    );
  });

  it("queda registrado quién lo hizo", async () => {
    db.convFindFirst.mockResolvedValue({ phone: "573116164568", bsuid: null });
    await ignoreConversationContact(STORE, CONV, { reason: REASON, userId: "paula-123" });
    expect(db.ignCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ createdByUserId: "paula-123", reason: REASON }) }),
    );
  });
});

describe("dejar de ignorar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.ignDeleteMany.mockResolvedValue({ count: 1 });
    db.ignAggregate.mockResolvedValue({ _sum: { skippedCount: 412 } });
  });

  it("quita la regla y dice cuánto se dejó pasar", async () => {
    db.convFindFirst.mockResolvedValue({ phone: "8618858869228", bsuid: "CN.1377520137782797" });

    const result = await unignoreConversationContact(STORE, CONV);

    expect(result).toEqual({ ok: true, removed: 1, pending: 412 });
    expect(db.ignDeleteMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          storeId: STORE,
          OR: [{ phone: "8618858869228" }, { bsuid: "CN.1377520137782797" }],
        }),
      }),
    );
  });

  it("una conversación que no es de esta tienda no se toca", async () => {
    db.convFindFirst.mockResolvedValue(null);
    await expect(unignoreConversationContact(STORE, CONV)).resolves.toEqual({ ok: false });
    expect(db.ignDeleteMany).not.toHaveBeenCalled();
  });
});
