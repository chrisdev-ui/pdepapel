import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import { authenticateWhatsAppWebhook } from "@/lib/whatsapp/webhook-auth";

const TOKEN = "test-whatsapp-verify-token-0123456789";
const CHAKRA = "chakra-secret";
const META = "meta-secret";
const BODY = JSON.stringify({ entry: [] });
const hmac = (secret: string, body = BODY) => createHmac("sha256", secret).update(body).digest("hex");
const request = (headers: Record<string, string> = {}, query = "") =>
  new Request(`https://admin.example.com/api/webhook/whatsapp${query}`, { method: "POST", headers, body: BODY });

describe("authenticateWhatsAppWebhook", () => {
  it("firma de Chakra: hex sin prefijo, con o sin token", () => {
    expect(authenticateWhatsAppWebhook(request({ "x-chakra-signature-256": hmac(CHAKRA) }), BODY, { CHAKRA_WEBHOOK_SECRET: CHAKRA })).toEqual({
      method: "chakra_hmac",
      signed: true,
      tokenVia: "none",
      chakraSignature: "present",
    });
    expect(authenticateWhatsAppWebhook(request({ "x-chakra-signature-256": `sha256=${hmac(CHAKRA)}` }), BODY, { CHAKRA_WEBHOOK_SECRET: CHAKRA }).method).toBe("chakra_hmac");
  });

  it("una firma sobre otro cuerpo no vale", () => {
    const auth = authenticateWhatsAppWebhook(request({ "x-chakra-signature-256": hmac(CHAKRA, "otro") }), BODY, { CHAKRA_WEBHOOK_SECRET: CHAKRA, WHATSAPP_WEBHOOK_VERIFY_TOKEN: TOKEN });
    expect(auth).toMatchObject({ method: "rejected", signed: false });
  });

  it("con el secreto de Chakra puesto, el token solo ya no basta", () => {
    expect(authenticateWhatsAppWebhook(request({}, `?token=${TOKEN}`), BODY, { CHAKRA_WEBHOOK_SECRET: CHAKRA, WHATSAPP_WEBHOOK_VERIFY_TOKEN: TOKEN })).toMatchObject({
      method: "rejected",
      tokenVia: "query",
    });
  });

  it("sin el secreto, el token vale como antes y nunca cuenta como firmado", () => {
    expect(authenticateWhatsAppWebhook(request({ "x-webhook-token": TOKEN }), BODY, { WHATSAPP_WEBHOOK_VERIFY_TOKEN: TOKEN })).toEqual({
      method: "token_header",
      signed: false,
      tokenVia: "header",
      chakraSignature: "absent",
    });
    expect(authenticateWhatsAppWebhook(request({}, `?token=${TOKEN}`), BODY, { WHATSAPP_WEBHOOK_VERIFY_TOKEN: TOKEN }).method).toBe("token_query");
    expect(authenticateWhatsAppWebhook(request({}, "?token=otro"), BODY, { WHATSAPP_WEBHOOK_VERIFY_TOKEN: TOKEN }).method).toBe("rejected");
  });

  it("la firma de Meta sigue valiendo con su secreto, aun con el de Chakra puesto", () => {
    expect(authenticateWhatsAppWebhook(request({ "x-hub-signature-256": `sha256=${hmac(META)}` }), BODY, { WHATSAPP_APP_SECRET: META, CHAKRA_WEBHOOK_SECRET: CHAKRA })).toMatchObject({
      method: "meta_hmac",
      signed: true,
    });
  });

  it("anota la cabecera de Chakra aunque todavía no haya secreto para comprobarla", () => {
    expect(authenticateWhatsAppWebhook(request({ "x-chakra-signature-256": hmac(CHAKRA), "x-webhook-token": TOKEN }), BODY, { WHATSAPP_WEBHOOK_VERIFY_TOKEN: TOKEN })).toMatchObject({
      method: "token_header",
      chakraSignature: "present",
    });
  });
});
