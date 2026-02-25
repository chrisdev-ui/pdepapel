"use client";

import { DailyBreakdown } from "@/actions/get-financial-analytics";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

  const getChartTitle = () => {
    if (!data || data.length === 0) return "Rendimiento Mensual";
    const firstDate = parseISO(data[0].date);
    const monthYear = format(firstDate, "MMMM 'de' yyyy", { locale: es });
    return `Rendimiento de ${monthYear.replace(/^\w/, (c) => c.toUpperCase())} (Ingresos vs Beneficio)`;
  };

  return (
    <Card className="col-span-4">
      <CardHeader>
        <CardTitle>{getChartTitle()}</CardTitle>
      </CardHeader>
      <CardContent className="pl-2">
        <div className="mt-4 h-[350px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={formattedData}
              margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            >
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#e5e7eb"
                className="dark:stroke-gray-800"
              />
              <XAxis
                dataKey="formattedDate"
                stroke="#888888"
                fontSize={12}
                tickLine={false}
                axisLine={false}
                dy={10}
              />
              <YAxis
                stroke="#888888"
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
                name="Ingreso Bruto"
                stroke="#3b82f6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorRevenue)"
              />
              <Area
                type="monotone"
                dataKey="profit"
                name="Beneficio Neto"
                stroke="#10b981"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorProfit)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
