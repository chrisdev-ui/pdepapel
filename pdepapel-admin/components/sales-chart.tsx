"use client";

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

interface SalesDataPoint {
  date: string;
  revenue: number;
  orders: number;
}

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
          <Tooltip
            content={({ active, payload, label }) => {
              if (active && payload && payload.length) {
                return (
                  <div className="rounded-lg border bg-white p-4 shadow-lg">
                    <p className="font-semibold">{label}</p>
                    <p className="text-[#a5c3ff]">
                      Ganancia:{" "}
                      {currencyFormatter.format(Number(payload[0]?.value ?? 0))}
                    </p>
                    <p className="text-[#fea4c3]">
                      Número de órdenes:{" "}
                      {numberFormatter.format(Number(payload[1].value ?? 0))}
                    </p>
                  </div>
                );
              }
              return null;
            }}
          />

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
