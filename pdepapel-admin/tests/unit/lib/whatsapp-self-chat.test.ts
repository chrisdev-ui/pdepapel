import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prismadb", () => ({ default: {} }));

import { isSelfChatEcho, notSelfChatSql, notSelfChatWhere, scanSelfChat } from "@/lib/whatsapp/self-chat";

const BUSINESS = "573009999999";
const BUSINESS_BSUID = "CO.7000000000000001";
const CUSTOMER = "573001234567";

const payload = (value: Record<string, unknown>) => ({
  entry: [{ id: "WABA", changes: [{ field: "smb_message_echoes", value: { metadata: { display_phone_number: "+57 300 9999999" }, ...value } }] }],
});
const echo = (to: string | null, toUserId: string | null, text = "/ayuda") => ({
  id: "wamid.x",
  from: BUSINESS,
  ...(to ? { to } : {}),
  ...(toUserId ? { to_user_id: toUserId } : {}),
  timestamp: "1790000000",
  type: "text",
  text: { body: text },
});

describe("isSelfChatEcho", () => {
  it("del negocio al mismo número del negocio", () => {
    expect(isSelfChatEcho({ from: BUSINESS, to: BUSINESS, toUserId: null, businessPhone: BUSINESS }, null)).toBe(true);
  });

  it("un eco hacia una clienta nunca es el chat consigo misma", () => {
    expect(isSelfChatEcho({ from: BUSINESS, to: CUSTOMER, toUserId: "CO.7000000000000002", businessPhone: BUSINESS }, BUSINESS_BSUID)).toBe(false);
  });

  it("from y to iguales pero distintos del número del negocio no cuentan", () => {
    expect(isSelfChatEcho({ from: CUSTOMER, to: CUSTOMER, toUserId: null, businessPhone: BUSINESS }, null)).toBe(false);
  });

  it("sin teléfono, por el BSUID ya conocido del negocio", () => {
    expect(isSelfChatEcho({ from: BUSINESS, to: null, toUserId: BUSINESS_BSUID, businessPhone: BUSINESS }, BUSINESS_BSUID)).toBe(true);
    expect(isSelfChatEcho({ from: BUSINESS, to: null, toUserId: BUSINESS_BSUID, businessPhone: BUSINESS }, null)).toBe(false);
  });
});

describe("scanSelfChat", () => {
  it("aprende el número y el BSUID del eco que coincide por teléfono", () => {
    const scan = scanSelfChat(payload({ message_echoes: [echo(BUSINESS, BUSINESS_BSUID)] }), null);
    expect(scan.onlySelfChat).toBe(true);
    expect(scan.learned).toEqual({ phone: BUSINESS, bsuid: BUSINESS_BSUID });
    expect(scan.echoes[0]).toMatchObject({ selfChat: true, text: "/ayuda", timestamp: 1790000000 });
  });

  it("un eco hacia una clienta no se aprende ni se marca, aunque empiece con «/»", () => {
    const scan = scanSelfChat(payload({ message_echoes: [echo(CUSTOMER, "CO.7000000000000002", "/estado 1")] }), BUSINESS_BSUID);
    expect(scan.onlySelfChat).toBe(false);
    expect(scan.learned).toEqual({ phone: null, bsuid: null });
    expect(scan.echoes[0].selfChat).toBe(false);
  });

  it("un cuerpo con mensajes o estados además del eco no es solo chat consigo misma", () => {
    const mixed = scanSelfChat(payload({ message_echoes: [echo(BUSINESS, null)], messages: [{ id: "m", from: CUSTOMER }] }), null);
    expect(mixed.onlySelfChat).toBe(false);
    expect(mixed.echoes[0].selfChat).toBe(true);
  });

  it("nunca lanza con cuerpos raros", () => {
    expect(scanSelfChat({ _rawUnparsable: "x" }, null)).toMatchObject({ echoes: [], onlySelfChat: false });
    expect(scanSelfChat({ entry: [{ changes: [null, { value: { message_echoes: [null] } }] }] }, null).onlySelfChat).toBe(false);
  });
});

describe("filtros de consulta", () => {
  it("sin identidad no filtra nada", () => {
    expect(notSelfChatWhere({ phone: null, bsuid: null })).toEqual({});
    expect(notSelfChatSql({ phone: null, bsuid: null }).sql).toBe("");
  });

  it("acepta explícitamente las filas con teléfono o BSUID nulos", () => {
    expect(notSelfChatWhere({ phone: BUSINESS, bsuid: BUSINESS_BSUID })).toEqual({
      AND: [
        { OR: [{ phone: null }, { phone: { not: BUSINESS } }] },
        { OR: [{ bsuid: null }, { bsuid: { not: BUSINESS_BSUID } }] },
      ],
    });
    const sql = notSelfChatSql({ phone: BUSINESS, bsuid: null });
    expect(sql.sql).toBe("AND (c.`phone` IS NULL OR c.`phone` <> ?)");
    expect(sql.values).toEqual([BUSINESS]);
  });
});
