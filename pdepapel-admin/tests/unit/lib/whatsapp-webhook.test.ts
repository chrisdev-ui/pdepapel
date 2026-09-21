import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  classifyWhatsAppWebhookEvent,
  getWhatsAppWebhookPhone,
  getWhatsAppWebhookIdentity,
  getWhatsAppWebhookConversationKey,
  hashWhatsAppWebhookPayload,
  parseWhatsAppWebhookPayload,
  verifyWhatsAppWebhookSignature,
} from "@/lib/whatsapp/webhook";

const metaMessage = (overrides: Record<string, unknown> = {}) => ({
  object: "whatsapp_business_account",
  entry: [
    {
      id: "WABA-123",
      changes: [
        {
          field: "messages",
          value: {
            messaging_product: "whatsapp",
            metadata: { display_phone_number: "573132582293", phone_number_id: "PHONE-9" },
            contacts: [{ profile: { name: "Ana" }, wa_id: "573000000000" }],
            messages: [{ from: "573000000000", id: "wamid.ABC", timestamp: "1789000000", type: "text", text: { body: "Hola" } }],
            ...overrides,
          },
        },
      ],
    },
  ],
});

describe("parseWhatsAppWebhookPayload", () => {
  it("keeps an unparsable body instead of throwing", () => {
    expect(parseWhatsAppWebhookPayload("not json")).toEqual({ _rawUnparsable: "not json" });
    expect(parseWhatsAppWebhookPayload("[1,2]")).toEqual({ _rawUnparsable: "[1,2]" });
    expect(parseWhatsAppWebhookPayload('{"a":1}')).toEqual({ a: 1 });
  });
});

describe("classifyWhatsAppWebhookEvent", () => {
  it("reads topic, phone number, WABA and message id from Meta's native shape", () => {
    expect(classifyWhatsAppWebhookEvent(metaMessage())).toEqual({
      topic: "messages",
      resource: "PHONE-9",
      sellerId: "WABA-123",
      eventKey: "wamid.ABC",
    });
  });

  it("uses the status id when the change carries a delivery status", () => {
    const payload = metaMessage({ messages: undefined, statuses: [{ id: "wamid.STATUS", status: "delivered" }] });
    expect(classifyWhatsAppWebhookEvent(payload).eventKey).toBe("wamid.STATUS");
  });

  it("hashes the whole body when a batch carries several ids, so none is lost to deduplication", () => {
    const payload = metaMessage({ messages: [{ id: "wamid.1" }, { id: "wamid.2" }] });
    const classified = classifyWhatsAppWebhookEvent(payload);
    expect(classified.topic).toBe("messages");
    expect(classified.eventKey).toBe(hashWhatsAppWebhookPayload(payload));
    expect(classified.eventKey).toHaveLength(64);
  });

  it("falls back to the WABA as resource when there is no phone metadata", () => {
    const payload = metaMessage({ metadata: undefined });
    expect(classifyWhatsAppWebhookEvent(payload).resource).toBe("WABA-123");
  });

  it("classifies anything else as unknown with a stable hash, never throwing", () => {
    const normalized = { event: "message.received", data: { text: "hola" } };
    const first = classifyWhatsAppWebhookEvent(normalized);
    expect(first).toMatchObject({ topic: "unknown", resource: "unknown", sellerId: null });
    expect(first.eventKey).toBe(classifyWhatsAppWebhookEvent({ data: { text: "hola" }, event: "message.received" }).eventKey);
    expect(classifyWhatsAppWebhookEvent({ _rawUnparsable: "x" }).topic).toBe("unknown");
    expect(classifyWhatsAppWebhookEvent({ entry: "nope" }).topic).toBe("unknown");
  });
});

describe("getWhatsAppWebhookPhone", () => {
  it("takes the sender of the first message, or the recipient of the first status, digits only", () => {
    expect(getWhatsAppWebhookPhone(metaMessage())).toBe("573000000000");
    expect(getWhatsAppWebhookPhone(metaMessage({ messages: [{ from: "+57 300-000-0000", id: "wamid.1" }] }))).toBe("573000000000");
    expect(getWhatsAppWebhookPhone(metaMessage({ messages: undefined, statuses: [{ id: "wamid.out", status: "sent", recipient_id: "573000000001" }] }))).toBe("573000000001");
  });

  it("reads the customer phone from an owner echo, which carries it in `to`", () => {
    const echoPayload = {
      entry: [{
        id: "WABA-123",
        changes: [{
          field: "smb_message_echoes",
          value: {
            message_echoes: [{ from: "573132582293", to: "+57 300 000 0000", id: "wamid.echo", type: "text" }],
          },
        }],
      }],
    };
    expect(getWhatsAppWebhookPhone(echoPayload)).toBe("573000000000");
  });

  it("returns null for bodies without a phone instead of throwing", () => {
    expect(getWhatsAppWebhookPhone({ _rawUnparsable: "x" })).toBeNull();
    expect(getWhatsAppWebhookPhone({ entry: [{ changes: [{ value: { messages: [{ from: "abc" }] } }] }] })).toBeNull();
  });

  it("toma el teléfono de `contacts[]` cuando el mensaje no trae `from`", () => {
    // Meta lo manda en los dos sitios; leer el segundo hace que la llave de la
    // cola sea más fiable, no menos.
    expect(
      getWhatsAppWebhookPhone(metaMessage({ messages: [{ id: "wamid.1" }], statuses: "nope" })),
    ).toBe("573000000000");
  });
});

/**
 * Lo que rompió con las clientas que tienen nombre de usuario: Meta deja de
 * mandar el teléfono y manda un BSUID. Antes esto devolvía `null` y todas
 * compartían la misma fila de espera de la cola.
 */
describe("getWhatsAppWebhookIdentity", () => {
  const sinTelefono = (value: Record<string, unknown>) => ({
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value }] }],
  });

  it("saca el BSUID de un mensaje entrante sin teléfono", () => {
    const payload = sinTelefono({
      contacts: [{ profile: { name: "Eliana" }, user_id: "CO.2465629583926901" }],
      messages: [{ id: "wamid.1", type: "text", from_user_id: "CO.2465629583926901" }],
    });
    expect(getWhatsAppWebhookIdentity(payload)).toEqual({
      phone: null,
      bsuid: "CO.2465629583926901",
    });
    expect(getWhatsAppWebhookConversationKey(payload)).toBe("CO.2465629583926901");
  });

  it("saca el BSUID de un eco de Paula, que lo trae en `to_user_id`", () => {
    const payload = {
      entry: [
        {
          id: "WABA",
          changes: [
            {
              field: "smb_message_echoes",
              value: {
                contacts: [{ user_id: "CO.2465629583926901" }],
                message_echoes: [
                  { id: "wamid.eco", type: "text", from: "573999999999", to_user_id: "CO.2465629583926901" },
                ],
              },
            },
          ],
        },
      ],
    };
    expect(getWhatsAppWebhookIdentity(payload)).toEqual({
      phone: null,
      bsuid: "CO.2465629583926901",
    });
  });

  it("prefiere el teléfono cuando llegan los dos, y conserva el BSUID", () => {
    const payload = sinTelefono({
      contacts: [{ wa_id: "573001234567", user_id: "CO.123456789" }],
      messages: [{ id: "wamid.1", from: "573001234567", from_user_id: "CO.123456789" }],
    });
    expect(getWhatsAppWebhookIdentity(payload)).toEqual({
      phone: "573001234567",
      bsuid: "CO.123456789",
    });
    expect(getWhatsAppWebhookConversationKey(payload)).toBe("573001234567");
  });

  it("no confunde con un BSUID algo que no lo es", () => {
    const payload = sinTelefono({
      messages: [{ id: "wamid.1", from_user_id: "no-es-un-bsuid" }],
    });
    expect(getWhatsAppWebhookIdentity(payload)).toEqual({ phone: null, bsuid: null });
    expect(getWhatsAppWebhookConversationKey(payload)).toBeNull();
  });
});

describe("verifyWhatsAppWebhookSignature", () => {
  const body = JSON.stringify(metaMessage());
  const secret = "app-secret";
  const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  it("accepts Meta's HMAC over the raw body and rejects everything else", () => {
    expect(verifyWhatsAppWebhookSignature(body, signature, secret)).toBe(true);
    expect(verifyWhatsAppWebhookSignature(body, signature.toUpperCase(), secret)).toBe(true);
    expect(verifyWhatsAppWebhookSignature(body + " ", signature, secret)).toBe(false);
    expect(verifyWhatsAppWebhookSignature(body, signature, "other")).toBe(false);
    expect(verifyWhatsAppWebhookSignature(body, "sha256=zz", secret)).toBe(false);
    expect(verifyWhatsAppWebhookSignature(body, null, secret)).toBe(false);
    expect(verifyWhatsAppWebhookSignature(body, signature, undefined)).toBe(false);
  });
});
