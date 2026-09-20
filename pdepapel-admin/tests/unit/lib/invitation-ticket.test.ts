import { describe, expect, it } from "vitest";

import { hasUsableTicket, readTicketProblem } from "@/lib/invitation-ticket";

/**
 * La página de aceptación solo se muestra con un billete de invitación con
 * forma válida y sin caducar. No se comprueba la firma: de eso se encarga
 * Clerk al registrar. Esto impide que la ruta sea un registro abierto en el
 * dominio del panel.
 */
const NOW = new Date("2026-09-19T12:00:00Z");
const encode = (payload: Record<string, unknown>) =>
  Buffer.from(JSON.stringify(payload)).toString("base64url");
const ticket = (payload: Record<string, unknown>) => `cabecera.${encode(payload)}.firma`;

describe("billete de invitación", () => {
  it("acepta un billete con forma de JWT y caducidad futura", () => {
    const valid = ticket({ exp: Math.floor(NOW.getTime() / 1000) + 3600, sid: "inv_1" });
    expect(readTicketProblem(valid, NOW)).toBeNull();
    expect(hasUsableTicket(valid, NOW)).toBe(true);
  });

  it("acepta un billete sin caducidad declarada", () => {
    expect(readTicketProblem(ticket({ sid: "inv_1" }), NOW)).toBeNull();
  });

  it("rechaza cuando no hay billete", () => {
    for (const value of [undefined, null, "", "   ", 42, {}, []]) {
      expect(readTicketProblem(value, NOW)).toBe("missing");
      expect(hasUsableTicket(value, NOW)).toBe(false);
    }
  });

  it("rechaza un billete que no tiene forma de JWT", () => {
    for (const value of ["abc", "a.b", "a.b.c.d", "a..c", ".b.c"]) {
      expect(readTicketProblem(value, NOW)).toBe("malformed");
    }
    expect(readTicketProblem("cabecera.no-es-base64-json.firma", NOW)).toBe("malformed");
  });

  it("rechaza un billete caducado", () => {
    const expired = ticket({ exp: Math.floor(NOW.getTime() / 1000) - 1 });
    expect(readTicketProblem(expired, NOW)).toBe("expired");
    expect(hasUsableTicket(expired, NOW)).toBe(false);
  });
});
