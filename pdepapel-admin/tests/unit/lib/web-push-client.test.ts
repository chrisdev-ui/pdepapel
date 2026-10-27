import { describe, expect, it } from "vitest";

import { describePushFailure, IOS_INSTALL_TEXT, notConfiguredText, IOS_TOO_OLD_TEXT, UNSUPPORTED_TEXT, unsupportedReason } from "@/lib/web-push-client";

const IPHONE_17 = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const IPHONE_16_1 = "Mozilla/5.0 (iPhone; CPU iPhone OS 16_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.1 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";
const FULL = { hasPushManager: true, hasServiceWorker: true, hasNotification: true };
const SAFARI_TAB = { hasPushManager: false, hasServiceWorker: true, hasNotification: false };

describe("unsupportedReason", () => {
  it("un navegador con todo puede intentar", () => {
    expect(unsupportedReason({ userAgent: ANDROID, standalone: false, ...FULL })).toBeNull();
    expect(unsupportedReason({ userAgent: IPHONE_17, standalone: true, ...FULL })).toBeNull();
  });

  it("iPhone en Safari (sin instalar) explica que hay que agregarlo a la pantalla de inicio", () => {
    expect(unsupportedReason({ userAgent: IPHONE_17, standalone: false, ...SAFARI_TAB })).toBe(IOS_INSTALL_TEXT);
    expect(unsupportedReason({ userAgent: IPAD_DESKTOP_UA, standalone: false, ...SAFARI_TAB })).toBe(IOS_INSTALL_TEXT);
  });

  it("iOS anterior a 16.4 no puede aunque esté instalado", () => {
    expect(unsupportedReason({ userAgent: IPHONE_16_1, standalone: true, ...SAFARI_TAB })).toBe(IOS_TOO_OLD_TEXT);
  });

  it("otro navegador sin soporte dice lo de siempre", () => {
    expect(unsupportedReason({ userAgent: ANDROID, standalone: false, hasPushManager: false, hasServiceWorker: false, hasNotification: false })).toBe(UNSUPPORTED_TEXT);
  });
});

describe("describePushFailure", () => {
  const domError = (name: string) => Object.assign(new Error("raw browser text"), { name });

  it("permiso negado lleva a los ajustes de notificaciones", () => {
    expect(describePushFailure("permission", domError("NotAllowedError"))).toContain("Ajustes › Notificaciones › P de Papel");
    expect(describePushFailure("subscribe", domError("NotAllowedError"))).toContain("permiso");
  });

  it("dice en qué paso falló y el tipo de error, nunca el texto crudo", () => {
    const register = describePushFailure("register", domError("SecurityError"));
    expect(register).toContain("instalar el servicio de avisos");
    expect(register).toContain("SecurityError");
    const subscribe = describePushFailure("subscribe", domError("AbortError"));
    expect(subscribe).toContain("no respondió");
    expect(subscribe).toContain("AbortError");
    expect(subscribe).not.toContain("raw browser text");
  });

  it("al guardar usa el mensaje del panel si lo hay", () => {
    expect(describePushFailure("save", new Error("x"), "Ya hay 10 aparatos con avisos.")).toBe("Ya hay 10 aparatos con avisos.");
    expect(describePushFailure("save", new Error("x"), null)).toContain("no pudo guardar");
  });
});

describe("notConfiguredText", () => {
  it("una pista por motivo, sin valores", () => {
    expect(notConfiguredText("bad_subject_format")).toContain("«mailto:»");
    expect(notConfiguredText("missing_private")).toContain("WEB_PUSH_VAPID_PRIVATE_KEY");
    expect(notConfiguredText("bad_public_key_format")).toContain("87 caracteres");
    expect(notConfiguredText("missing_public")).toContain("NEXT_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY");
  });

  it("sin motivo o con uno desconocido, el texto de siempre", () => {
    expect(notConfiguredText(null)).toBe("No configurado: al panel le faltan las llaves de los avisos.");
    expect(notConfiguredText("otro")).toBe("No configurado: al panel le faltan las llaves de los avisos.");
  });
});
