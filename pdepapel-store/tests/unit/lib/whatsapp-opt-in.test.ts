import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { WHATSAPP_OPT_IN_LABEL, WHATSAPP_OPT_IN_VERSION, whatsappOptInPayload } from "@/lib/whatsapp-opt-in";

describe("casilla de avisos por WhatsApp", () => {
  it("sin marcar no viaja nada; marcada viaja la versión del texto", () => {
    expect(whatsappOptInPayload(false)).toBeUndefined();
    expect(whatsappOptInPayload(true)).toEqual({ version: WHATSAPP_OPT_IN_VERSION });
  });

  it("la tienda y la administración usan la misma versión", () => {
    const admin = readFileSync(join(__dirname, "..", "..", "..", "..", "pdepapel-admin", "lib", "whatsapp-opt-in.ts"), "utf8");
    expect(admin).toContain(`WHATSAPP_OPT_IN_VERSION = "${WHATSAPP_OPT_IN_VERSION}"`);
    expect(admin).toContain(`WHATSAPP_OPT_IN_TEXT = "${WHATSAPP_OPT_IN_LABEL}"`);
  });
});
