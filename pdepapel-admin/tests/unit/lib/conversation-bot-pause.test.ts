import { describe, expect, it, vi } from "vitest";

// `lib/whatsapp/bot` arrastra el validador de entorno y Prisma. Se importa
// solo para comprobar que el panel y el bot cuentan igual; lo de alrededor se
// simula. Que haga falta esto es justamente por qué la cuenta vive en un
// módulo neutro y no ahí dentro.
vi.mock("@/lib/env.mjs", () => ({ env: {} }));
vi.mock("@/lib/prismadb", () => ({ default: {} }));

import {
  OWNER_TAKEOVER_WINDOW_HOURS,
  canHandBackToBot,
  describeBotPause,
  formatBotPause,
} from "@/lib/conversation-bot-pause";
import { isOwnerActive } from "@/lib/whatsapp/bot";

const AHORA = new Date("2026-09-21T20:00:00.000Z");
const haceHoras = (h: number) => new Date(AHORA.getTime() - h * 3600000);

describe("la pausa del bot que ve Paula", () => {
  it("sin nada de Paula, el bot contesta", () => {
    expect(describeBotPause(null, AHORA)).toEqual({ paused: false, remainingMs: 0 });
    expect(formatBotPause(describeBotPause(null, AHORA))).toBeNull();
    expect(canHandBackToBot(null, AHORA)).toBe(false);
  });

  it("recién escrito por ella, el bot queda callado casi un día", () => {
    const pausa = describeBotPause(haceHoras(1), AHORA);
    expect(pausa.paused).toBe(true);
    expect(formatBotPause(pausa)).toBe("Bot en pausa · vuelve en 23 h");
    expect(canHandBackToBot(haceHoras(1), AHORA)).toBe(true);
  });

  it("en el último tramo lo dice en minutos, que «en 0 h» parece un error", () => {
    const pausa = describeBotPause(
      new Date(AHORA.getTime() - (OWNER_TAKEOVER_WINDOW_HOURS * 3600000 - 12 * 60000)),
      AHORA,
    );
    expect(formatBotPause(pausa)).toBe("Bot en pausa · vuelve en 12 min");
  });

  it("pasado el día, el bot vuelve y no hay nada que reanudar", () => {
    const viejo = haceHoras(OWNER_TAKEOVER_WINDOW_HOURS + 1);
    expect(describeBotPause(viejo, AHORA).paused).toBe(false);
    expect(formatBotPause(describeBotPause(viejo, AHORA))).toBeNull();
    expect(canHandBackToBot(viejo, AHORA)).toBe(false);
  });

  it("aguanta una fecha que llegue como texto, que es como viaja por la API", () => {
    expect(describeBotPause(haceHoras(2).toISOString(), AHORA).paused).toBe(true);
    expect(describeBotPause("no es una fecha", AHORA).paused).toBe(false);
  });

  /**
   * Lo que el panel enseña y lo que el bot decide salen de la misma cuenta. Si
   * se separaran, el aviso sería peor que no tenerlo: diría «vuelve en 2 h» y
   * el bot podría haber vuelto ya.
   */
  it("el panel y el bot están de acuerdo en todo momento", () => {
    for (const horas of [0, 0.5, 1, 12, 23.9, 24, 25, 100]) {
      const cuando = haceHoras(horas);
      expect(describeBotPause(cuando, AHORA).paused).toBe(
        isOwnerActive(cuando, AHORA),
      );
    }
  });
});
