import { bestTimeLevel, type BestTimeNetwork } from "@/lib/social/best-time";
import { NETWORK_NAME } from "@/lib/social/tags";
import { cn } from "@/lib/utils";

const DECIMAL = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 1 });
const BAND_HOURS: Record<string, string> = { madrugada: "0–6 h", mañana: "6–12 h", mediodía: "12–15 h", tarde: "15–19 h", noche: "19–24 h" };
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Tres tonos claros con texto oscuro y uno fuerte con texto blanco: todos pasan 4,5:1. */
const LEVEL_CLASS = ["", "bg-primary/10 text-primary", "bg-primary/25 text-primary", "bg-primary/45 text-primary", "bg-primary/80 text-white"] as const;
const LEGEND = [
  { level: 1, label: "menos de 0,8×" },
  { level: 2, label: "0,8× a 1,2×" },
  { level: 3, label: "1,2× a 1,6×" },
  { level: 4, label: "1,6× o más" },
] as const;

/** Día × franja de Bogotá con la mediana de «× mediana». La tabla misma es la versión en texto para lector de pantalla. */
export function BestTimeCard({ network }: { network: BestTimeNetwork }) {
  const titleId = `mejor-horario-${network.platform.toLowerCase()}`;
  const bands = network.rows[0]?.map((cell) => cell.band) ?? [];

  return (
    <section aria-labelledby={titleId} className="flex min-w-0 flex-col gap-3 rounded-xl border bg-white p-4 shadow-sm">
      <div>
        <h2 id={titleId} className="text-base font-semibold text-primary">
          Mejor horario en {NETWORK_NAME[network.platform]}
        </h2>
        <p className="text-xs text-muted-foreground">Cuántas veces la mediana de la red, según el día y la hora de Bogotá. Últimos 90 días.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[300px] table-fixed border-separate border-spacing-1 text-center text-xs">
          <caption className="sr-only">
            Mejor horario en {NETWORK_NAME[network.platform]}: «× mediana» por día y franja; vacío con menos de 2 publicaciones.
          </caption>
          <thead>
            <tr>
              <th scope="col" className="w-12">
                <span className="sr-only">Día</span>
              </th>
              {bands.map((band) => (
                <th key={band} scope="col" className="font-medium text-muted-foreground">
                  <span className="hidden sm:block">{capitalize(band)}</span>
                  <span className="sm:hidden" aria-hidden>
                    {BAND_HOURS[band]}
                  </span>
                  <span className="sr-only sm:hidden">
                    {band} ({BAND_HOURS[band]})
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {network.rows.map((row) => (
              <tr key={row[0].day}>
                <th scope="row" className="text-left font-medium text-muted-foreground">
                  <span aria-hidden className="sm:hidden">
                    {capitalize(row[0].day.slice(0, 3))}
                  </span>
                  <span className="sr-only sm:not-sr-only">{capitalize(row[0].day)}</span>
                </th>
                {row.map((cell) => (
                  <td
                    key={cell.band}
                    className={cn("h-9 rounded-md tabular-nums", cell.medianMultiplier === null ? "text-muted-foreground" : cn("font-semibold", LEVEL_CLASS[bestTimeLevel(cell.medianMultiplier)]))}
                  >
                    {cell.medianMultiplier === null ? (
                      <>
                        <span aria-hidden>·</span>
                        <span className="sr-only">{cell.count === 0 ? "sin publicaciones" : `${cell.count} ${cell.count === 1 ? "publicación" : "publicaciones"}, pocos datos`}</span>
                      </>
                    ) : (
                      <>
                        {DECIMAL.format(cell.medianMultiplier)}×<span className="sr-only"> · {cell.count} publicaciones</span>
                      </>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground" aria-label="Qué significa cada tono">
        {LEGEND.map((item) => (
          <li key={item.level} className="flex items-center gap-1">
            <span aria-hidden className={cn("inline-block h-3 w-3 rounded-sm", LEVEL_CLASS[item.level])} />
            {item.label}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Más oscuro = va mejor. Las casillas con «·» tienen menos de 2 publicaciones: se llenan con las semanas.
        {network.approx && " Mientras no haya lecturas de 7 días, los números son aproximados."}
      </p>
    </section>
  );
}
