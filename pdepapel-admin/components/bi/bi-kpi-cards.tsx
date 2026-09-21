import { MonthOverMonth } from "@/actions/get-financial-analytics";
import { MetricCard } from "@/components/ui/metric-card";
import { TintBadge } from "@/components/ui/tint-badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { currencyFormatter } from "@/lib/utils";
import {
  Activity,
  ArrowDownIcon,
  ArrowUpIcon,
  DollarSign,
  Info,
  Percent,
  ShoppingBag,
} from "lucide-react";

interface BiKpiCardsProps {
  data: MonthOverMonth;
}

/**
 * Ayuda sobre una cifra, en un botón de verdad.
 *
 * Antes el disparador era el propio icono: Radix le colgaba el `onClick` a un
 * `<svg>`, así que el tabulador no lo encontraba y no había forma de leer la
 * explicación sin ratón.
 */
function Ayuda({ children, label }: { children: string; label: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="ml-1.5 inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p className="max-w-xs text-sm">{children}</p>
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * La variación del mes, como insignia y no como texto de color.
 *
 * Iba en `text-emerald-500` / `text-red-500` a 12 px sobre blanco: 2,5:1 y
 * 3,7:1, por debajo del mínimo legible. Y el color era la única señal de si
 * subió o bajó. Con el tinte pastel detrás y el texto en oscuro son 13:1, y la
 * flecha dice el signo aunque no se distingan los tonos.
 */
function Variacion({
  value,
  upIsGood = true,
}: {
  value: number;
  upIsGood?: boolean;
}) {
  if (value === 0) return <TintBadge tone="slate" label="igual" />;
  const isUp = value > 0;
  const good = isUp === upIsGood;
  const Arrow = isUp ? ArrowUpIcon : ArrowDownIcon;
  return (
    <TintBadge tone={good ? "mint" : "pink"} className="gap-1 px-2">
      <Arrow className="h-3 w-3" aria-hidden="true" />
      {Math.abs(value).toFixed(0)} %
    </TintBadge>
  );
}

export const BiKpiCards: React.FC<BiKpiCardsProps> = ({ data }) => {
  const { currentMonth, percentageChange } = data;

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label={
            <span className="inline-flex items-center">
              Ingresos recibidos
              <Ayuda label="Qué cuenta como ingreso recibido">
                Incluye pedidos pagados de P de Papel y ventas de Mercado Libre
                solo cuando la liquidación neta está confirmada.
              </Ayuda>
            </span>
          }
          value={currencyFormatter(currentMonth.total_revenue)}
          note="frente al mes anterior"
          icon={<DollarSign className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-sky"
          valueAdornment={<Variacion value={percentageChange.revenue} />}
        />

        <MetricCard
          label={
            <span className="inline-flex items-center">
              Te quedó libre
              <Ayuda label="Cómo se calcula lo que te queda libre">
                Dinero real ganado. Se calcula restando los costos del producto,
                la tarifa de envío y la comisión del pago en línea al ingreso
                recibido.
              </Ayuda>
            </span>
          }
          value={currencyFormatter(currentMonth.total_net_profit)}
          note="frente al mes anterior"
          icon={<Activity className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-mint"
          valueAdornment={<Variacion value={percentageChange.net_profit} />}
        />

        <MetricCard
          label={
            <span className="inline-flex items-center">
              Margen promedio
              <Ayuda label="Qué mide el margen promedio">
                El porcentaje de ganancia que representa lo que te queda libre
                respecto a las ventas netas.
              </Ayuda>
            </span>
          }
          value={`${Math.round(currentMonth.average_margin)} %`}
          note="sobre los ingresos recibidos"
          icon={<Percent className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-lavender"
        />

        <MetricCard
          label={
            <span className="inline-flex items-center">
              Ventas pagadas
              <Ayuda label="Qué cuenta como venta pagada">
                Cantidad de pedidos de P de Papel y ventas de Mercado Libre con
                liquidación neta confirmada durante el mes.
              </Ayuda>
            </span>
          }
          value={currentMonth.total_orders.toString()}
          note="frente al mes anterior"
          icon={<ShoppingBag className="h-4 w-4" aria-hidden="true" />}
          tint="bg-tint-cream"
          valueAdornment={<Variacion value={percentageChange.orders} />}
        />
      </div>
    </TooltipProvider>
  );
};
