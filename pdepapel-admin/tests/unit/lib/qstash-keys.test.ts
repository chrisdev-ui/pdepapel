import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prismadb", () => ({ default: {} }));

import { getMercadoLibreOutboxFlowControlKey } from "@/lib/mercadolibre/queue";
import { isValidQStashKey, qstashKey, QSTASH_KEY_PATTERN } from "@/lib/qstash-keys";
import { getWhatsAppFlowControlKey } from "@/lib/whatsapp/queue";
import { selfChatLane } from "@/lib/whatsapp/self-chat";

const UUID = "f23ee5bc-1f6f-4c10-9872-9e6217cc17fd";

describe("qstashKey", () => {
  it("deja igual lo que QStash ya acepta", () => {
    expect(qstashKey("whatsapp-conversation", "CO.2465629583926901")).toBe("whatsapp-conversation-CO.2465629583926901");
    expect(qstashKey("mercadolibre", "operation", UUID)).toBe(`mercadolibre-operation-${UUID}`);
    expect(qstashKey("wait", "alert", "abc_123")).toBe("wait-alert-abc_123");
  });

  it("cambia por «_» lo que QStash rechaza, en vez de perder el mensaje", () => {
    expect(qstashKey("whatsapp-conversation", "self:store")).toBe("whatsapp-conversation-self_store");
    expect(qstashKey("x", "+57 300 000/0000")).toBe("x-_57_300_000_0000");
    expect(isValidQStashKey(qstashKey("a", "ñ:é ü#"))).toBe(true);
  });

  it("nunca devuelve una llave vacía", () => {
    expect(qstashKey()).toBe("unknown");
    expect(qstashKey("", "  ")).toBe("unknown");
  });
});

describe("todas las llaves que construimos cumplen la regla de QStash", () => {
  const samples = ["573009999999", "CO.7000000000000001", "US.13491000000000", UUID, "unknown", "", null, undefined, selfChatLane(UUID), "self:legacy"];

  it.each(samples)("WhatsApp con %s", (contact) => {
    expect(getWhatsAppFlowControlKey(contact as string | null | undefined)).toMatch(QSTASH_KEY_PATTERN);
  });

  it("la fila de comandos no lleva «:»", () => {
    expect(selfChatLane(UUID)).toBe(`self-${UUID}`);
    expect(getWhatsAppFlowControlKey(selfChatLane(UUID))).toMatch(QSTASH_KEY_PATTERN);
  });

  it("Mercado Libre (outbox de ventas y operaciones)", () => {
    expect(getMercadoLibreOutboxFlowControlKey(UUID, "notification")).toMatch(QSTASH_KEY_PATTERN);
    expect(getMercadoLibreOutboxFlowControlKey(UUID, "operation")).toMatch(QSTASH_KEY_PATTERN);
  });
});

/**
 * Ninguna llave de flujo ni id de deduplicación se arma a mano: si aparece un
 * `flowControl` o un `deduplicationId` que no pasa por el ayudante (o por una
 * función que lo usa), esta prueba lo señala con el archivo.
 */
describe("ninguna llave de QStash se arma sin el ayudante", () => {
  const ROOT = path.resolve(__dirname, "../../..");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) return name === "node_modules" ? [] : walk(full);
      return /\.(ts|tsx|mjs)$/.test(name) ? [full] : [];
    });
  const SAFE_KEY = /key:\s*(qstashKey\(|getWhatsAppFlowControlKey\(|getMercadoLibreOutboxFlowControlKey\()/;

  it("cada `flowControl` usa qstashKey o un constructor que lo usa", () => {
    const offenders: string[] = [];
    for (const file of [...walk(path.join(ROOT, "lib")), ...walk(path.join(ROOT, "app"))]) {
      const text = readFileSync(file, "utf8");
      const blocks = text.split("flowControl:").slice(1);
      for (const block of blocks) {
        const head = block.slice(0, 200);
        if (!SAFE_KEY.test(head)) offenders.push(path.relative(ROOT, file));
      }
      for (const match of Array.from(text.matchAll(/deduplicationId:\s*([^,\n]+)/g))) {
        // `deduplicationId: string` es una firma de tipos, no una llave.
        if (/^(string|number)\b/.test(match[1].trim())) continue;
        if (!/qstashKey\(/.test(match[1])) offenders.push(`${path.relative(ROOT, file)} (deduplicationId)`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
