"use client";

import { getSalesData } from "@/actions/get-sales-data";
import {
  currencyFormatter,
  numberFormatter,
  shortCurrencyFormatter,
} from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import React, { useMemo } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type SalesDataPoint = Awaited<ReturnType<typeof getSalesData>>[number];

interface SalesChartProps {
  data: SalesDataPoint[];
}

export const SalesChart: React.FC<SalesChartProps> = ({ data }) => {
  const formattedData = useMemo(
    () =>
      data.map((item) => ({
        ...item,
        date: format(parseISO(item.date), "dd MMM", { locale: es }),
      })),
    [data],
  );

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload) return null;

    const dataPoint = payload[0]?.payload;
    if (!dataPoint) return null;

    return (
      <div className="space-y-2 rounded-lg border bg-white p-4 shadow-lg">
        <p className="border-b pb-2 font-semibold">{label}</p>

        {/* Revenue Section */}
        <div className="space-y-1">
          <p className="text-sm text-gray-600">
            Ingresos Brutos: {currencyFormatter.format(dataPoint.grossRevenue)}
          </p>
          <div className="pl-2 text-sm">
            <p className="text-red-600">
              Descuentos: -{currencyFormatter.format(dataPoint.discounts)}
            </p>
            <p className="text-orange-600">
              Cupones: -{currencyFormatter.format(dataPoint.couponDiscounts)}
            </p>
          </div>
          <p className="font-semibold text-[#a5c3ff]">
            Ingresos Netos: {currencyFormatter.format(dataPoint.revenue)}
          </p>
        </div>

        {/* Orders Section */}
        <div className="space-y-1 border-t pt-2">
          <p className="text-[#fea4c3]">
            Órdenes: {numberFormatter.format(dataPoint.orders)}
          </p>
          <p className="text-sm text-gray-600">
            Productos Vendidos: {numberFormatter.format(dataPoint.items)}
          </p>
          <p className="text-sm text-gray-600">
            Valor Promedio por Orden:{" "}
            {currencyFormatter.format(dataPoint.averageOrderValue)}
          </p>
        </div>
      </div>
    );
  };
  return (
    <div className="h-[400px] w-full p-4">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={formattedData}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />

          {/* X-Axis (Dates) */}
          <XAxis dataKey="date" tickLine={false} className="text-sm" />

          {/* Left Y-Axis (Revenue) */}
          <YAxis
            yAxisId="revenue"
            orientation="left"
            tickFormatter={(value) => shortCurrencyFormatter.format(value)}
            className="text-sm"
            tickLine={false}
          />

          {/* Right Y-Axis (Orders) */}
          <YAxis
            yAxisId="orders"
            orientation="right"
            className="text-sm"
            tickLine={false}
          />

          {/* Tooltip */}
          <Tooltip content={CustomTooltip} />
          <Legend />

          {/* Revenue Bars */}
          <Bar
            dataKey="revenue"
            fill="#a5c3ff"
            yAxisId="revenue"
            name="Ganancia"
            radius={[4, 4, 0, 0]}
            className="opacity-80"
          />

          {/* Orders Line */}
          <Line
            type="monotone"
            dataKey="orders"
            stroke="#fea4c3"
            strokeWidth={2}
            yAxisId="orders"
            name="Número de órdenes"
            dot={{ r: 4 }}
            activeDot={{ r: 6 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
};
