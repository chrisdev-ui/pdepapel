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
      chakraCheck: "chakra_hmac_valid",
    });
    expect(authenticateWhatsAppWebhook(request({ "x-chakra-signature-256": `sha256=${hmac(CHAKRA)}` }), BODY, { CHAKRA_WEBHOOK_SECRET: CHAKRA }).method).toBe("chakra_hmac");
  });

  describe("con el secreto y CHAKRA_WEBHOOK_ENFORCE=true (cerrado)", () => {
    const secrets = { CHAKRA_WEBHOOK_SECRET: CHAKRA, CHAKRA_WEBHOOK_ENFORCE: "true", WHATSAPP_WEBHOOK_VERIFY_TOKEN: TOKEN };

    it("una firma sobre otro cuerpo no vale aunque el token sea bueno", () => {
      const auth = authenticateWhatsAppWebhook(request({ "x-chakra-signature-256": hmac(CHAKRA, "otro"), "x-webhook-token": TOKEN }), BODY, secrets);
      expect(auth).toMatchObject({ method: "rejected", signed: false, chakraCheck: "chakra_hmac_invalid" });
    });

    it("el token solo ya no basta", () => {
      expect(authenticateWhatsAppWebhook(request({}, `?token=${TOKEN}`), BODY, secrets)).toMatchObject({
        method: "rejected",
        tokenVia: "query",
        chakraCheck: "chakra_hmac_missing",
      });
    });

    it("«1» también lo enciende; cualquier otro valor no", () => {
      expect(authenticateWhatsAppWebhook(request({}, `?token=${TOKEN}`), BODY, { ...secrets, CHAKRA_WEBHOOK_ENFORCE: "1" }).method).toBe("rejected");
      expect(authenticateWhatsAppWebhook(request({}, `?token=${TOKEN}`), BODY, { ...secrets, CHAKRA_WEBHOOK_ENFORCE: "false" }).method).toBe("token_query");
      expect(authenticateWhatsAppWebhook(request({}, `?token=${TOKEN}`), BODY, { ...secrets, CHAKRA_WEBHOOK_ENFORCE: "si" }).method).toBe("token_query");
    });
  });

  describe("con el secreto y sin CHAKRA_WEBHOOK_ENFORCE (observación)", () => {
    const secrets = { CHAKRA_WEBHOOK_SECRET: CHAKRA, WHATSAPP_WEBHOOK_VERIFY_TOKEN: TOKEN };

    it("una firma mala con token bueno pasa como hoy, anotada como inválida y sin firmar", () => {
      expect(authenticateWhatsAppWebhook(request({ "x-chakra-signature-256": hmac(CHAKRA, "otro") }, `?token=${TOKEN}`), BODY, secrets)).toEqual({
        method: "token_query",
        signed: false,
        tokenVia: "query",
        chakraSignature: "present",
        chakraCheck: "chakra_hmac_invalid",
      });
    });

    it("sin firma y con token pasa como hoy, anotada como ausente", () => {
      expect(authenticateWhatsAppWebhook(request({ "x-webhook-token": TOKEN }), BODY, secrets)).toMatchObject({
        method: "token_header",
        signed: false,
        chakraCheck: "chakra_hmac_missing",
      });
    });

    it("una firma buena cuenta como firmada (los comandos corren) y no hace falta token", () => {
      expect(authenticateWhatsAppWebhook(request({ "x-chakra-signature-256": hmac(CHAKRA) }), BODY, secrets)).toMatchObject({
        method: "chakra_hmac",
        signed: true,
        chakraCheck: "chakra_hmac_valid",
      });
    });

    it("sin token ni firma se rechaza, igual que hoy", () => {
      expect(authenticateWhatsAppWebhook(request(), BODY, secrets)).toMatchObject({ method: "rejected", chakraCheck: "chakra_hmac_missing" });
    });
  });

  it("sin el secreto, el token vale como antes y nunca cuenta como firmado", () => {
    expect(authenticateWhatsAppWebhook(request({ "x-webhook-token": TOKEN }), BODY, { WHATSAPP_WEBHOOK_VERIFY_TOKEN: TOKEN })).toEqual({
      method: "token_header",
      signed: false,
      tokenVia: "header",
      chakraSignature: "absent",
      chakraCheck: null,
    });
    expect(authenticateWhatsAppWebhook(request({}, `?token=${TOKEN}`), BODY, { WHATSAPP_WEBHOOK_VERIFY_TOKEN: TOKEN }).method).toBe("token_query");
    expect(authenticateWhatsAppWebhook(request({}, "?token=otro"), BODY, { WHATSAPP_WEBHOOK_VERIFY_TOKEN: TOKEN }).method).toBe("rejected");
  });

  it("la firma de Meta sigue valiendo con su secreto, aun con el de Chakra puesto", () => {
    expect(authenticateWhatsAppWebhook(request({ "x-hub-signature-256": `sha256=${hmac(META)}` }), BODY, { WHATSAPP_APP_SECRET: META, CHAKRA_WEBHOOK_SECRET: CHAKRA, CHAKRA_WEBHOOK_ENFORCE: "true" })).toMatchObject({
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
