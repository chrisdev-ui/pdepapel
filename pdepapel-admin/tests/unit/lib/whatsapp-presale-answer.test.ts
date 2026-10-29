import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({ env: { FRONTEND_STORE_URL: "https://papeleriapdepapel.com", NODE_ENV: "test" } }));
vi.mock("@/lib/prismadb", () => ({ default: {} }));
vi.mock("@/lib/email", () => ({ sendOrderEmail: vi.fn() }));

import { buildPresaleAnswer, mentionsPresaleProduct, PRESALE_WAITLIST_OFFER, wantsPreorderWaitlist } from "@/lib/whatsapp/presale-answer";

const NAME = "Calendario de adviento Kiut Love Letters";

describe("respuesta del bot para una preventa", () => {
  it("reconoce el producto por dos palabras de su nombre, no por una suelta", () => {
    expect(mentionsPresaleProduct("Hola, ¿tienen el calendario de adviento?", NAME)).toBe(true);
    expect(mentionsPresaleProduct("calendarios de adviento kiut", NAME)).toBe(true);
    expect(mentionsPresaleProduct("Calendario Kiut", NAME)).toBe(true);
    expect(mentionsPresaleProduct("¿tienen adviento?", NAME)).toBe(false);
    expect(mentionsPresaleProduct("calendario 2027", NAME)).toBe(false);
  });

  it("con anticipo: precio, anticipo, saldo, fecha y enlace", () => {
    const text = buildPresaleAnswer({
      name: NAME,
      slug: "calendario-de-adviento-kiut-love-letters",
      price: 160000,
      presale: { paymentMode: "DEPOSIT", depositType: "FIXED", depositValue: 30000, expectedArrivalAt: null, expectedArrivalText: null },
    });
    expect(text).toContain("$ 160.000".replace(" ", " ").length ? "160.000" : "");
    expect(text).toContain("30.000");
    expect(text).toContain("130.000");
    expect(text).toContain("Fecha estimada: por confirmar");
    expect(text).toContain("https://papeleriapdepapel.com/producto/calendario-de-adviento-kiut-love-letters");
    expect(text.split("\n").at(-1)).toBe("Si prefieres esperar, dime y te anoto en la lista de espera.");
    expect(text).not.toContain("Escribe «lista de espera»");
    expect(text).not.toContain("te avisamos");
  });

  it("quien pide la lista de espera se reconoce (y va a Paula); preguntas parecidas no", () => {
    expect(PRESALE_WAITLIST_OFFER).toBe("Si prefieres esperar, dime y te anoto en la lista de espera.");
    for (const yes of ["lista de espera", "Sí, anótame porfa", "me anotas en la lista?", "prefiero esperar", "Quiero esperar a que llegue", "apúntame"]) {
      expect(wantsPreorderWaitlist(yes), yes).toBe(true);
    }
    for (const no of ["¿tienen el calendario de adviento?", "anota mi dirección: calle 1", "cuánto hay que esperar el envío?", "espera un momento"]) {
      expect(wantsPreorderWaitlist(no), no).toBe(false);
    }
  });
});
