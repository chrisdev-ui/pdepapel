import { describe, expect, it } from "vitest";

import {
  ALERT_MAX_WAIT_MS,
  ALERT_MINUTES_DEFAULT,
  clampAlertMinutes,
  decideAlert,
  formatWaitingAgo,
  isAlertQuietHours,
  waitingAlertPush,
  type Wait,
} from "@/lib/whatsapp/waiting";

/** Reglas puras del aviso de «Clientas esperando» (lib/whatsapp/waiting.ts). */
const MIN = 60 * 1000;
/** Hora de Bogotá → UTC (UTC−5, sin horario de verano). */
const bogota = (hhmm: string) => new Date(`2026-10-27T${hhmm}:00-05:00`);
const waitSince = (since: Date): Wait => ({ startMessageId: "m1", since, lastCustomerAt: since, lastCustomerMessageId: "m1", messages: [] });

describe("horas de silencio del aviso (22:00–06:59 en Bogotá)", () => {
  it.each([
    ["21:59", false],
    ["22:00", true],
    ["23:30", true],
    ["00:00", true],
    ["06:59", true],
    ["07:00", false],
    ["12:00", false],
  ])("a las %s → silencio %s", (hhmm, quiet) => {
    expect(isAlertQuietHours(bogota(hhmm))).toBe(quiet);
  });
});

describe("decideAlert", () => {
  it("antes del umbral espera; desde el umbral avisa", () => {
    const now = bogota("15:00");
    expect(decideAlert({ wait: waitSince(new Date(now.getTime() - 29 * MIN - 59_000)), now, minutes: 30 })).toEqual({ decision: "skip", reason: "too_early" });
    expect(decideAlert({ wait: waitSince(new Date(now.getTime() - 30 * MIN)), now, minutes: 30 })).toEqual({ decision: "send", reason: null });
  });

  it("respeta el umbral de cada tienda", () => {
    const now = bogota("15:00");
    const wait = waitSince(new Date(now.getTime() - 10 * MIN));
    expect(decideAlert({ wait, now, minutes: 5 }).decision).toBe("send");
    expect(decideAlert({ wait, now, minutes: 15 })).toEqual({ decision: "skip", reason: "too_early" });
  });

  it.each([
    ["21:59", "send"],
    ["22:00", "skip"],
    ["06:59", "skip"],
    ["07:00", "send"],
  ])("a las %s la decisión es %s", (hhmm, decision) => {
    const now = bogota(hhmm);
    const result = decideAlert({ wait: waitSince(new Date(now.getTime() - 45 * MIN)), now, minutes: 30 });
    expect(result.decision).toBe(decision);
    if (decision === "skip") expect(result.reason).toBe("quiet_hours");
  });

  it("una espera de más de un día no manda push (después de un despliegue no llueven avisos viejos)", () => {
    const now = bogota("15:00");
    expect(decideAlert({ wait: waitSince(new Date(now.getTime() - ALERT_MAX_WAIT_MS - MIN)), now, minutes: 30 })).toEqual({ decision: "skip", reason: "too_old" });
  });
});

describe("clampAlertMinutes", () => {
  it.each([
    [undefined, ALERT_MINUTES_DEFAULT],
    [null, ALERT_MINUTES_DEFAULT],
    [Number.NaN, ALERT_MINUTES_DEFAULT],
    [1, 5],
    [30, 30],
    [999, 240],
  ])("%s → %s", (value, expected) => {
    expect(clampAlertMinutes(value as number | null | undefined)).toBe(expected);
  });
});

describe("texto del push y de la tarjeta", () => {
  it("solo minutos y el enlace a la lista filtrada: nada de la clienta", () => {
    const now = bogota("15:00");
    const push = waitingAlertPush({ storeId: "store-1", since: new Date(now.getTime() - 42 * MIN), now });
    expect(push).toEqual({ title: "P de Papel", body: "Una clienta lleva 42 min esperando", url: "/store-1/conversaciones?esperando=1" });
    expect(Object.keys(push).sort()).toEqual(["body", "title", "url"]);
  });

  it.each([
    [42, "hace 42 min"],
    [59, "hace 59 min"],
    [60, "hace 1 h"],
    [23 * 60 + 59, "hace 23 h"],
    [24 * 60, "hace 1 día"],
    [72 * 60, "hace 3 días"],
  ])("%s min → «%s»", (minutes, text) => {
    const now = bogota("15:00");
    expect(formatWaitingAgo(new Date(now.getTime() - minutes * MIN), now)).toBe(text);
  });
});
