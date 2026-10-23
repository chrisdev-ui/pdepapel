"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { NETWORK_NAME } from "@/lib/social/tags";
import { WHAT_WORKS_TENTATIVE_TEXT, type WhatWorksGroup, type WhatWorksNetwork } from "@/lib/social/what-works";

const GROUP_LABEL: Record<WhatWorksGroup, string> = {
  FORMATO: "Formato",
  GANCHO: "Gancho",
  TIPO: "Tipo",
  DURACION: "Duración",
  DIA: "Día",
  FRANJA: "Franja horaria",
};
const DECIMAL = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const FIRST_ROWS = 6;

/** Por red: qué etiquetas van mejor, en los últimos 90 días. Mientras faltan datos lo dice, sin parecer roto. */
export function WhatWorksCard({ network }: { network: WhatWorksNetwork }) {
  const [all, setAll] = useState(false);
  const rows = all ? network.rows : network.rows.slice(0, FIRST_ROWS);
  const titleId = `que-funciona-${network.platform.toLowerCase()}`;
  const enough = network.rows.some((row) => !row.fewData);

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm">
      <div>
        <h2 id={titleId} className="text-base font-semibold text-primary">
          Qué funciona en {NETWORK_NAME[network.platform]}
        </h2>
        <p className="text-xs text-muted-foreground">
          Últimos 90 días · {network.posts} {network.posts === 1 ? "publicación" : "publicaciones"}
        </p>
      </div>
      {network.headline ? (
        <div>
          <p className="text-sm font-semibold text-primary">{network.headline}</p>
          {network.headlineTentative && <p className="text-xs text-muted-foreground">{WHAT_WORKS_TENTATIVE_TEXT}</p>}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {enough
            ? "Ninguna etiqueta se separa todavía de la mediana."
            : "Todavía hay pocos datos: esto se llena a medida que etiquetes publicaciones y pasen las semanas."}
        </p>
      )}
      {network.rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aún no hay dos publicaciones con la misma etiqueta. Etiquétalas desde el detalle de cada una.</p>
      ) : (
        <ul className="flex flex-col divide-y" aria-label={`Etiquetas de ${NETWORK_NAME[network.platform]}`}>
          {rows.map((row) => (
            <li key={`${row.group}:${row.label}`} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-2 text-sm">
              <span className="min-w-0">
                <span className="text-xs text-muted-foreground">{GROUP_LABEL[row.group]} · </span>
                <span className="font-semibold text-primary">{row.label}</span>
              </span>
              <span className="flex flex-wrap gap-x-3 text-muted-foreground tabular-nums">
                <span className={row.medianMultiplier === null ? undefined : "font-semibold text-primary"}>
                  {row.medianMultiplier === null ? "sin «× mediana»" : `${DECIMAL.format(row.medianMultiplier)}×${row.approx ? " aprox." : ""}`}
                </span>
                {row.medianWatchedPct !== null && <span>{DECIMAL.format(row.medianWatchedPct)} % visto</span>}
                {row.medianSkipRate !== null && <span>{DECIMAL.format(row.medianSkipRate)} % salta</span>}
                <span>
                  {row.count} {row.count === 1 ? "publicación" : "publicaciones"}
                  {row.fewData && " · pocos datos"}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
      {network.rows.length > FIRST_ROWS && (
        <Button type="button" variant="outline" className="h-11 self-start" aria-expanded={all} onClick={() => setAll((value) => !value)}>
          {all ? "Ver menos" : `Ver todas (${network.rows.length})`}
        </Button>
      )}
    </section>
  );
}
