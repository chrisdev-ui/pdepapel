// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { BestTimeCard } from "@/app/(dashboard)/[storeId]/(routes)/redes/components/best-time-card";
import { WhatWorksCard } from "@/app/(dashboard)/[storeId]/(routes)/redes/components/what-works-card";
import { bestTimeGrid } from "@/lib/social/best-time";
import { WHAT_WORKS_TENTATIVE_TEXT, type WhatWorksNetwork } from "@/lib/social/what-works";

afterEach(cleanup);

const network = (headlineTentative: boolean): WhatWorksNetwork => ({
  platform: "INSTAGRAM",
  posts: 16,
  rows: [{ group: "FRANJA", label: "tarde", count: 7, fewData: false, medianMultiplier: 1.6, approx: headlineTentative, medianWatchedPct: null, medianSkipRate: 57 }],
  headline: `En Instagram lo publicado en la tarde va 1,6× la mediana${headlineTentative ? " (aprox.)" : ""}.`,
  headlineTentative,
});

describe("«Qué funciona»: la pista", () => {
  it("con valores «aprox.» dice que es una pista bajo el titular", () => {
    render(<WhatWorksCard network={network(true)} />);
    expect(screen.getByText(WHAT_WORKS_TENTATIVE_TEXT)).toBeInTheDocument();
    expect(WHAT_WORKS_TENTATIVE_TEXT).toBe("Todavía es una pista, no una regla: se confirma en unas semanas.");
  });

  it("con lecturas reales de 7 días la línea desaparece", () => {
    render(<WhatWorksCard network={network(false)} />);
    expect(screen.getByText("En Instagram lo publicado en la tarde va 1,6× la mediana.")).toBeInTheDocument();
    expect(screen.queryByText(WHAT_WORKS_TENTATIVE_TEXT)).toBeNull();
  });
});

describe("Mejor horario", () => {
  const post = (day: string, band: string, multiplier: number | null) => ({
    platform: "INSTAGRAM" as const,
    multiplier,
    multiplierApprox: true,
    autoTags: [
      { group: "DIA" as const, label: day },
      { group: "FRANJA" as const, label: band },
    ],
  });

  it("es una tabla con encabezados de día y franja; casillas con menos de 2 publicaciones sin número", () => {
    const [grid] = bestTimeGrid([post("martes", "tarde", 1.4), post("martes", "tarde", 1.8), post("jueves", "noche", 2)]);
    render(<BestTimeCard network={grid} />);
    const table = screen.getByRole("table", { name: /Mejor horario en Instagram/ });
    const martes = within(table).getByRole("row", { name: /Martes/ });
    expect(within(martes).getByText("1,6×")).toBeInTheDocument();
    const jueves = within(table).getByRole("row", { name: /Jueves/ });
    expect(within(jueves).getByText("1 publicación, pocos datos")).toBeInTheDocument();
    expect(screen.getByText(/los números son aproximados/)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Qué significa cada tono" }).children).toHaveLength(4);
  });
});
