import { followerSpanFloor, type DailyFollowers } from "@/lib/social/followers";

const NUMBER = new Intl.NumberFormat("es-CO");
const DAY_LABEL = new Intl.DateTimeFormat("es-CO", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

const signed = (value: number) =>
  `${value > 0 ? "+" : value < 0 ? "−" : ""}${NUMBER.format(Math.abs(value))}`;
const dayLabel = (day: string) =>
  DAY_LABEL.format(new Date(`${day}T00:00:00Z`));

/** La línea de seguidores de los últimos 30 días; sin dos días con lectura no se dibuja. */
function Sparkline({ series }: { series: DailyFollowers["series"] }) {
  const width = 120;
  const height = 32;
  const values = series.map((point) => point.followers);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const span = Math.max(high - low, followerSpanFloor(high));
  const min = (low + high) / 2 - span / 2;
  const points = series
    .map(
      (point, index) =>
        `${((index / (series.length - 1)) * (width - 4) + 2).toFixed(1)},${(height - 2 - ((point.followers - min) / span) * (height - 4)).toFixed(1)}`,
    )
    .join(" ");
  const first = series[0];
  const last = series[series.length - 1];
  return (
    <svg
      role="img"
      aria-label={`Seguidores del ${dayLabel(first.day)} al ${dayLabel(last.day)}: de ${NUMBER.format(first.followers)} a ${NUMBER.format(last.followers)}`}
      viewBox={`0 0 ${width} ${height}`}
      className="h-8 w-28 shrink-0 text-primary"
    >
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Cambio a 7 y 30 días; mientras faltan días, «pocos datos» y una frase de por qué. */
export function FollowersTrend({ daily }: { daily: DailyFollowers }) {
  if (!daily.since) return null;
  const missing = daily.delta7 === null || daily.delta30 === null;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-3">
        {daily.series.length >= 2 && <Sparkline series={daily.series} />}
        <dl className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {(
            [
              ["7 días", daily.delta7],
              ["30 días", daily.delta30],
            ] as const
          ).map(([label, value]) => (
            <div key={label} className="flex gap-1">
              <dt className="text-muted-foreground">{label}:</dt>
              <dd
                className={
                  value === null
                    ? "text-muted-foreground"
                    : "font-semibold text-primary"
                }
              >
                {value === null ? "pocos datos" : signed(value)}
              </dd>
            </div>
          ))}
        </dl>
      </div>
      {missing && (
        <p className="text-xs text-muted-foreground">
          Se completa con las semanas: hay lecturas desde el{" "}
          {dayLabel(daily.since)}.
        </p>
      )}
    </div>
  );
}
