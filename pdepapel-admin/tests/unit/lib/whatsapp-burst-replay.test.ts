import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({ env: {} }));
vi.mock("@/lib/prismadb", () => ({ default: {} }));

import { chooseFromBurst, type BurstContext, type BurstRow } from "@/lib/whatsapp/burst";
import { findBursts, judgeBurst, summarizeReplay } from "@/lib/whatsapp/burst-replay";

const T0 = new Date("2026-10-12T15:00:00Z").getTime();
let seq = 0;
const row = (seconds: number, body: string | null, extra: Partial<BurstRow> = {}): BurstRow => {
  seq += 1;
  return { id: `m${seq}`, externalId: `wamid.${seq}`, direction: "INBOUND", sentBy: "CUSTOMER", body, mediaType: null, metadata: null, createdAt: new Date(T0 + seconds * 1000), ...extra } as BurstRow;
};
const bot = (seconds: number) => row(seconds, "respuesta", { direction: "OUTBOUND", sentBy: "BOT" } as Partial<BurstRow>);
const CTX: BurstContext = { offerOpen: false, orderPending: false, keywords: [] };

const replay = (rows: BurstRow[], answeredIds: string[], shadowIds = rows.map((r) => r.id)) => {
  const shadow = new Map(shadowIds.map((id) => [id, { realCount: answeredIds.includes(id) ? 1 : 0 }]));
  return findBursts(rows).map((burst) => judgeBurst(burst, chooseFromBurst(burst.messages, CTX)!, shadow, CTX));
};

describe("findBursts", () => {
  it("una ráfaga por grupo de mensajes seguidos, tomada en su último mensaje; un mensaje solo no cuenta", () => {
    const rows = [row(0, "Hola"), row(5, "Tienes cuadernos?"), bot(20), row(30, "gracias"), row(500, "otra cosa"), row(505, "y algo más")];
    expect(findBursts(rows).map((burst) => burst.messages.map((message) => message.text))).toEqual([
      ["Hola", "Tienes cuadernos?"],
      ["otra cosa", "y algo más"],
    ]);
  });
});

describe("judgeBurst + summarizeReplay", () => {
  it("pregunta + relleno: el bot contestó al relleno, el modo ráfaga contesta la pregunta (lo arregla)", () => {
    const rows = [row(0, "Tienes el cuaderno Norma?"), row(4, "es para mi hija")];
    const [verdict] = replay(rows, [rows[1].id]);
    expect(verdict).toMatchObject({
      matched: true,
      answered: true,
      answeredPosition: 2,
      answeredIntent: "filler",
      chosenPosition: 1,
      chosenIntent: "product",
      comparison: "better",
      lostEarlier: true,
      fixedByBurst: true,
      linesJoined: 1,
    });
  });

  it("igual que hoy cuando el último ya era la pregunta", () => {
    const rows = [row(0, "Hola"), row(4, "Tienes el cuaderno Norma?")];
    expect(replay(rows, [rows[1].id])[0]).toMatchObject({ comparison: "same", lostEarlier: false });
  });

  it("dos productos: misma intención, pero junta las dos líneas", () => {
    const rows = [row(0, "Tienes cuaderno Norma?"), row(4, "y tienes lapiceros de gel?")];
    expect(replay(rows, [rows[1].id])[0]).toMatchObject({ comparison: "same_intent_other_text", linesJoined: 2 });
  });

  it("sin fila del modo sombra no se adivina: queda sin vínculo", () => {
    const rows = [row(0, "Tienes el cuaderno Norma?"), row(4, "gracias")];
    const verdicts = replay(rows, [], []);
    expect(verdicts[0]).toMatchObject({ matched: false, answered: false, comparison: null });
    expect(summarizeReplay(verdicts)).toMatchObject({ burstsFound: 1, withoutShadowLink: 1, matched: 0, botAnswered: 0 });
  });

  it("peor: si el bot contestó a algo más importante que lo que elegiría, se cuenta con intenciones y posiciones", () => {
    const rows = [row(0, "Hola"), row(4, "es para mi hija")];
    const shadow = new Map([[rows[0].id, { realCount: 1 }], [rows[1].id, { realCount: 0 }]]);
    const [burst] = findBursts(rows);
    // Una elección forzada a relleno, para ver cómo se cuenta un caso peor.
    const verdict = judgeBurst(burst, { text: "es para mi hija", intent: "filler", position: 2, webOrigin: null, intents: ["greeting", "filler"] }, shadow, CTX);
    const summary = summarizeReplay([verdict]);
    expect(summary.comparison.worse).toBe(1);
    expect(summary.worseCases).toEqual([{ position: { answered: 1, chosen: 2 }, intents: { answered: "greeting", chosen: "filler" } }]);
    expect(JSON.stringify(summary)).not.toMatch(/hija|Hola/);
  });

  it("dos mensajes contestados por separado en la misma ráfaga: el modo ráfaga ahorra uno", () => {
    const rows = [row(0, "Tienes cuadernos?"), row(4, "Tienes agendas?")];
    const summary = summarizeReplay(replay(rows, [rows[0].id, rows[1].id]));
    expect(summary).toMatchObject({ botAnswered: 1, repliesSaved: 1, extraDelaySeconds: { p50: 0, p90: 0 } });
  });
});
