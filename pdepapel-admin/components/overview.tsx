"use client";

import { getGraphRevenue } from "@/actions/get-graph-revenue";
import { yearColors } from "@/constants";
import { currencyFormatter, shortCurrencyFormatter } from "@/lib/utils";
import {
  Bar,
  BarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface OverviewProps {
  data: Awaited<ReturnType<typeof getGraphRevenue>>;
  year: number;
}

export const Overview: React.FC<OverviewProps> = ({ data, year }) => {
  const barColor =
    yearColors[year as keyof typeof yearColors] || yearColors.default;

  return (
    <ResponsiveContainer width="100%" height={350}>
      <BarChart data={data}>
        <XAxis
          dataKey="name"
          stroke="#888888"
          fontSize={12}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          stroke="#888888"
          fontSize={12}
          tickLine={false}
          axisLine={false}
          tickFormatter={(value: number) =>
            shortCurrencyFormatter.format(value)
          }
        />
        <Tooltip
          formatter={(value: number) => [
            currencyFormatter.format(value),
            "Ganancia",
          ]}
          labelFormatter={(label) => `${label}`}
        />
        <Bar dataKey="total" fill={barColor} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
};
