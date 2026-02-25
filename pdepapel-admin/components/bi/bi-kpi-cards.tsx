import { MonthOverMonth } from "@/actions/get-financial-analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

export const BiKpiCards: React.FC<BiKpiCardsProps> = ({ data }) => {
  const { currentMonth, percentageChange } = data;

  const renderChange = (value: number, inverseFormating: boolean = false) => {
    const isPositive = value > 0;
    const isZero = value === 0;
    // For some metrics, going up is bad (e.g. costs). Inverse formatting flips the color.
    const goodColor = inverseFormating ? "text-red-500" : "text-emerald-500";
    const badColor = inverseFormating ? "text-emerald-500" : "text-red-500";

    return (
      <div
        className={`mt-1 flex items-center text-xs ${isZero ? "text-muted-foreground" : isPositive ? goodColor : badColor}`}
      >
        {isPositive ? (
          <ArrowUpIcon className="mr-1 h-3 w-3" />
        ) : isZero ? null : (
          <ArrowDownIcon className="mr-1 h-3 w-3" />
        )}
        <span>{Math.abs(value).toFixed(0)}% vs mes anterior</span>
      </div>
    );
  };

  return (
    <TooltipProvider>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {/* Revenue Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center text-sm font-medium">
              Ingresos por Productos (Ventas Netas)
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="ml-2 h-4 w-4 cursor-help text-muted-foreground transition-colors hover:text-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs text-sm">
                    Monto facturado exclusivamente por la venta de mercancía,
                    excluyendo el dinero de envíos pagado por el cliente.
                  </p>
                </TooltipContent>
              </Tooltip>
            </CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {currencyFormatter(currentMonth.total_revenue)}
            </div>
            {renderChange(percentageChange.revenue)}
          </CardContent>
        </Card>

        {/* Net Profit Card */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center text-sm font-medium">
              Beneficio Neto (Real)
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="ml-2 h-4 w-4 cursor-help text-emerald-500 transition-colors hover:text-emerald-600" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="min-w-xs text-sm">
                    Dinero real ganado. Se calcula restando los costos del
                    producto, la tarifa de envío y la comisión de la pasarela de
                    pago (Wompi o PayU) al total facturado.
                  </p>
                </TooltipContent>
              </Tooltip>
            </CardTitle>
            <Activity className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {currencyFormatter(currentMonth.total_net_profit)}
            </div>
            {renderChange(percentageChange.net_profit)}
          </CardContent>
        </Card>

        {/* Margin Margin */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center text-sm font-medium">
              Margen Promedio
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="ml-2 h-4 w-4 cursor-help text-blue-500 transition-colors hover:text-blue-600" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs text-sm">
                    El porcentaje de ganancia que representa el beneficio neto
                    respecto a las ventas netas (Ingresos por Productos).
                  </p>
                </TooltipContent>
              </Tooltip>
            </CardTitle>
            <Percent className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Math.round(currentMonth.average_margin)}%
            </div>
            {/* We don't have MoM margin change mapped directly, so just showing status */}
            <p className="mt-1 text-xs text-muted-foreground">
              Basado en ventas netas (sin envío)
            </p>
          </CardContent>
        </Card>

        {/* Orders */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="flex items-center text-sm font-medium">
              Pedidos Pagados
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="ml-2 h-4 w-4 cursor-help text-muted-foreground transition-colors hover:text-foreground" />
                </TooltipTrigger>
                <TooltipContent>
                  <p className="max-w-xs text-sm">
                    Cantidad total de pedidos completados, pagados o enviados
                    por los clientes durante el mes actual.
                  </p>
                </TooltipContent>
              </Tooltip>
            </CardTitle>
            <ShoppingBag className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              +{currentMonth.total_orders}
            </div>
            {renderChange(percentageChange.orders)}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
};
