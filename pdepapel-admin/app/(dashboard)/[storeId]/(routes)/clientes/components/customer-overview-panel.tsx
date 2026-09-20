import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import type { CustomerOverview } from "../server/get-customers";

const CARDS = [
  { key: "total", label: "Clientes", hint: "Personas con al menos un pedido registrado" },
  { key: "buyers", label: "Han comprado", hint: "Con al menos una compra pagada" },
  { key: "vip", label: "VIP", hint: "Los que más han comprado" },
  { key: "inactive", label: "Inactivos", hint: "Llevan tiempo sin volver" },
] as const;

/**
 * Lo que ve una cuenta de solo lectura en Clientes: el tamaño y la forma de la
 * base, sin una sola persona identificable. La lista con nombre y teléfono es
 * de la dueña.
 */
export function CustomerOverviewPanel({ overview }: { overview: CustomerOverview }) {
  const { summary, cities } = overview;
  const topCity = cities[0]?.customers ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {CARDS.map((card) => (
          <Card key={card.key}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{card.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <p className="text-2xl font-bold text-primary">{summary[card.key]}</p>
              <p className="text-xs text-muted-foreground">{card.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">De dónde compran</CardTitle>
        </CardHeader>
        <CardContent>
          {cities.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no hay ciudades registradas en los pedidos.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {cities.map((row) => (
                <li key={row.city} className="flex items-center gap-3">
                  <span className="w-32 shrink-0 truncate text-sm text-foreground" title={row.city}>
                    {row.city}
                  </span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${topCity > 0 ? Math.max(4, Math.round((row.customers / topCity) * 100)) : 0}%` }}
                    />
                  </span>
                  <span className="w-10 shrink-0 text-right text-sm tabular-nums text-muted-foreground">{row.customers}</span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        La lista de clientes, con nombre y contacto, solo la ve la dueña de la tienda.
      </p>
    </div>
  );
}
