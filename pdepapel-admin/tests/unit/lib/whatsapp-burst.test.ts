import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env.mjs", () => ({ env: {} }));
vi.mock("@/lib/prismadb", () => ({ default: {} }));

import { parseOrderReply } from "@/lib/whatsapp/bot-order-request";
import {
  BURST_MAX_CHARS,
  assembleBurst,
  burstIntentOf,
  chooseFromBurst,
  describeBurst,
  type BurstContext,
  type BurstRow,
} from "@/lib/whatsapp/burst";

const T0 = new Date("2026-10-13T15:00:00Z").getTime();
let seq = 0;
const row = (seconds: number, body: string | null, extra: Partial<BurstRow> = {}): BurstRow => {
  seq += 1;
  return {
    id: `m${seq}`,
    externalId: `wamid.${seq}`,
    direction: "INBOUND",
    sentBy: "CUSTOMER",
    body,
    mediaType: null,
    metadata: null,
    createdAt: new Date(T0 + seconds * 1000),
    ...extra,
  } as BurstRow;
};
const bot = (seconds: number) => row(seconds, "respuesta", { direction: "OUTBOUND", sentBy: "BOT" } as Partial<BurstRow>);
const texts = (rows: BurstRow[]) => assembleBurst(rows, rows.at(-1)!.id).map((message) => message.text);
const CTX: BurstContext = { offerOpen: false, orderPending: false, keywords: [] };

describe("assembleBurst", () => {
  it("junta lo que escribió desde la última salida, en orden", () => {
    expect(texts([row(0, "viejo"), bot(5), row(10, "Hola"), row(15, "Cómo estás?"), row(20, "Tienes el cuaderno Norma?")])).toEqual([
      "Hola",
      "Cómo estás?",
      "Tienes el cuaderno Norma?",
    ]);
  });

  it("corta si entre dos mensajes pasan más de 90 s", () => {
    expect(texts([row(0, "Hola"), row(100, "Tienes cuadernos?")])).toEqual(["Tienes cuadernos?"]);
    expect(texts([row(0, "Hola"), row(90, "Tienes cuadernos?")])).toEqual(["Hola", "Tienes cuadernos?"]);
  });

  it("con 7 mensajes quedan los 6 últimos", () => {
    const rows = Array.from({ length: 7 }, (_, index) => row(index * 5, `m${index + 1}`));
    expect(texts(rows)).toEqual(["m2", "m3", "m4", "m5", "m6", "m7"]);
  });

  it("si pasan de 600 caracteres, se van los más viejos", () => {
    const long = "a".repeat(400);
    expect(texts([row(0, long), row(5, long), row(10, "Tienes cuadernos?")]).map((text) => text.length)).toEqual([400, 17]);
    expect(BURST_MAX_CHARS).toBe(600);
  });

  it("usa el texto editado y no lee la edición como otro mensaje", () => {
    const original = row(0, "Tienes cuaderno Nroma?");
    const edit = row(4, null, { mediaType: "edit", metadata: { edit: { of: original.externalId, text: "Tienes cuaderno Norma?" } } } as Partial<BurstRow>);
    expect(texts([original, edit, row(8, "gracias")])).toEqual(["Tienes cuaderno Norma?", "gracias"]);
    expect(texts([original, edit])).toEqual(["Tienes cuaderno Norma?"]);
  });

  it("una edición de algo ya contestado no deja nada que leer", () => {
    const original = row(0, "Tienes cuaderno Nroma?");
    const edit = row(20, null, { mediaType: "edit", metadata: { edit: { of: original.externalId, text: "Norma" } } } as Partial<BurstRow>);
    expect(texts([original, bot(10), edit])).toEqual([]);
  });

  it("las fotos y audios no entran como texto", () => {
    expect(texts([row(0, "mira esta", { mediaType: "image" } as Partial<BurstRow>), row(5, "Tienes esta agenda?")])).toEqual(["Tienes esta agenda?"]);
  });
});

describe("chooseFromBurst", () => {
  const messages = (...lines: string[]) => lines.map((text, index) => ({ id: `x${index}`, text, at: new Date(T0 + index * 1000) }));

  it("saludo + pregunta: contesta la pregunta", () => {
    const choice = chooseFromBurst(messages("Hola", "Cómo estás?", "Tienes el cuaderno Norma?"), CTX)!;
    expect(choice).toMatchObject({ text: "Tienes el cuaderno Norma?", intent: "product", position: 3 });
  });

  it("pregunta + relleno: contesta la pregunta, no el relleno", () => {
    const burst = messages("Tienes el cuaderno Norma?", "es para mi hija");
    const choice = chooseFromBurst(burst, CTX)!;
    expect(choice).toMatchObject({ text: "Tienes el cuaderno Norma?", intent: "product", position: 1 });
    expect(describeBurst(burst, choice, "shadow")).toEqual({
      mode: "shadow",
      size: 2,
      chars: 40,
      chosenIntent: "product",
      chosenPosition: 1,
      lastIntent: "filler",
      intents: ["product", "filler"],
      differs: true,
    });
  });

  it("dos productos en dos líneas: se preguntan juntos, como si fuera un mensaje", () => {
    expect(chooseFromBurst(messages("Tienes cuaderno Norma?", "y tienes lapiceros de gel?"), CTX)).toMatchObject({
      text: "Tienes cuaderno Norma? y tienes lapiceros de gel?",
      intent: "product",
    });
  });

  it("«sí» + «y también 2 lapiceros»: un pedido con el añadido, que el «sí» de siempre ya entiende", () => {
    const choice = chooseFromBurst(messages("sí", "y también 2 lapiceros"), { ...CTX, offerOpen: true })!;
    expect(choice).toMatchObject({ text: "sí y también 2 lapiceros", intent: "order", position: 1 });
    expect(parseOrderReply(choice.text)).toEqual({ quantity: 1, extra: { quantity: 2, query: "lapiceros" } });
  });

  it("un «sí» sin oferta abierta no es pedido", () => {
    expect(burstIntentOf("sí", CTX)).toBe("filler");
    expect(burstIntentOf("sí", { ...CTX, offerOpen: true })).toBe("order");
  });

  it("solo saludos y relleno: el saludo", () => {
    expect(chooseFromBurst(messages("Hola", "gracias"), CTX)).toMatchObject({ text: "Hola", intent: "greeting" });
  });

  it("nada reconocible: el último que no sea relleno, y el bot hace con él lo de siempre", () => {
    expect(chooseFromBurst(messages("te escribo por lo de la semana pasada", "gracias"), CTX)).toMatchObject({
      text: "te escribo por lo de la semana pasada",
      intent: "other",
    });
    expect(chooseFromBurst(messages("ok"), CTX)).toMatchObject({ text: "ok", intent: "filler" });
  });

  it("una respuesta de Paula cuenta como dato entendido", () => {
    const keywords = [{ id: "k1", label: "Horario", triggers: ["horario"], answer: "De 8 a 6" }] as BurstContext["keywords"];
    expect(chooseFromBurst(messages("hola", "cuál es el horario", "gracias"), { ...CTX, keywords })).toMatchObject({ intent: "fact", position: 2 });
  });

  it("un mensaje solo es él mismo", () => {
    expect(chooseFromBurst(messages("Tienes agendas 2027?"), CTX)).toMatchObject({ text: "Tienes agendas 2027?", position: 1 });
    expect(chooseFromBurst([], CTX)).toBeNull();
  });
});

describe("ráfaga y lo ya contestado (2026-10-14)", () => {
  it("no vuelve a leer un mensaje que otra corrida ya contestó, aunque su respuesta se haya guardado después", () => {
    const first = row(0, "Hola veci");
    first.metadata = { answered: first.externalId } as never;
    const rows = [first, row(7, "Buenas noches")];
    expect(texts(rows)).toEqual(["Buenas noches"]);
  });

  it("la ráfaga del mismo mensaje que se contestó se sigue armando completa (el modo sombra la vuelve a leer)", () => {
    const first = row(0, "Tienes el cuaderno Norma?");
    const last = row(4, "es para mi hija");
    first.metadata = { answered: last.externalId } as never;
    last.metadata = { answered: last.externalId } as never;
    expect(texts([first, last])).toEqual(["Tienes el cuaderno Norma?", "es para mi hija"]);
  });
});

