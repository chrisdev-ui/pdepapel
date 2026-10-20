import { describe, expect, it } from "vitest";

import { dayMessage, formatOpensAt } from "@/lib/capsule-copy";

describe("aviso de cupos de las cápsulas", () => {
  it("la hora de apertura en formato de 12 horas", () => {
    expect(formatOpensAt("08:00")).toBe("8:00 a. m.");
    expect(formatOpensAt("00:15")).toBe("12:15 a. m.");
    expect(formatOpensAt("12:00")).toBe("12:00 p. m.");
    expect(formatOpensAt("14:30")).toBe("2:30 p. m.");
  });

  it("abiertos, antes de abrir y llenos", () => {
    expect(dayMessage({ cap: 5, left: 3, opensAt: "08:00", closedReason: null })).toEqual({ headline: "Cupos de hoy: 3 de 5", detail: null });
    expect(dayMessage({ cap: 5, left: 5, opensAt: "08:00", closedReason: "before-open" })).toEqual({ headline: "Cupos de hoy: 5 de 5", detail: "Abren hoy a las 8:00 a. m." });
    expect(dayMessage({ cap: 5, left: 0, opensAt: "08:00", closedReason: "full" })).toEqual({ headline: "Cupos de hoy: 0 de 5", detail: "Vuelve mañana a las 8:00 a. m." });
  });
});
