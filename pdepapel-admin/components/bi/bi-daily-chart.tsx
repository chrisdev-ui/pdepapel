"use client";

import { DailyBreakdown } from "@/actions/get-financial-analytics";
import { SectionCard } from "@/components/ui/section-card";
import { currencyFormatter } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_COLORS } from "@/lib/chart-palette";

interface BiDailyChartProps {
  data: DailyBreakdown[];
}

export const BiDailyChart: React.FC<BiDailyChartProps> = ({ data }) => {
  // Format dates for the X-axis
  const formattedData = data.map((item) => ({
    ...item,
    formattedDate: format(parseISO(item.date), "MMM d", { locale: es }),
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="rounded-lg border border-border bg-background p-3 shadow-lg">
          <p className="mb-2 text-sm font-semibold">
            {format(parseISO(payload[0].payload.date), "dd 'de' MMMM", {
              locale: es,
            })}
          </p>
          <div className="flex flex-col gap-1">
            {payload.map((entry: any, index: number) => (
              <div key={index} className="flex items-center gap-2 text-sm">
                <div
                  className="h-3 w-3 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-muted-foreground">{entry.name}:</span>
                <span className="font-medium">
                  {currencyFormatter(entry.value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      );
    }
    return null;
  };

  const periodo =
    data && data.length > 0
      ? format(parseISO(data[0].date), "MMMM 'de' yyyy", { locale: es })
      : null;

  return (
    <SectionCard
      id="bi-dia-a-dia"
      title="Día a día del mes"
      description={
        periodo
          ? `Lo que entró y lo que te quedó libre cada día de ${periodo}.`
          : "Lo que entró y lo que te quedó libre cada día."
      }
    >
      {data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No hay ventas registradas en este mes.
        </p>
      ) : (
        <div className="-ml-2 h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={formattedData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={CHART_COLORS.primary}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor={CHART_COLORS.primary}
                    stopOpacity={0}
                  />
                </linearGradient>
                <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={CHART_COLORS.mint}
                    stopOpacity={0.3}
                  />
                  <stop
                    offset="95%"
                    stopColor={CHART_COLORS.mint}
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke={CHART_COLORS.grid}
              />
              <XAxis
                dataKey="formattedDate"
                stroke={CHART_COLORS.axis}
                fontSize={12}
                tickLine={false}
                axisLine={false}
                dy={10}
              />
              <YAxis
                stroke={CHART_COLORS.axis}
                fontSize={12}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `$${(value / 1000).toFixed(0)}k`} // Format as K
                dx={-10}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend verticalAlign="top" height={36} iconType="circle" />
              <Area
                type="monotone"
                dataKey="revenue"
                name="Ingresos recibidos"
                stroke={CHART_COLORS.primary}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorRevenue)"
              />
              <Area
                type="monotone"
                dataKey="profit"
                name="Te quedó libre"
                stroke={CHART_COLORS.mint}
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorProfit)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </SectionCard>
  );
};
