"use client";

import { getGraphRevenue } from "@/actions/get-graph-revenue";
import { yearColors } from "@/constants";
import { currencyFormatter, shortCurrencyFormatter } from "@/lib/utils";
import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  TooltipProps,
  XAxis,
  YAxis,
} from "recharts";
import {
  NameType,
  ValueType,
} from "recharts/types/component/DefaultTooltipContent";

type GraphData = Awaited<ReturnType<typeof getGraphRevenue>>[number];

interface OverviewProps {
  data: Array<GraphData>;
  year: number;
}

interface CustomTooltipProps extends TooltipProps<ValueType, NameType> {
  active?: boolean;
  payload?: {
    value: number;
    name: string;
    dataKey: string;
    payload: GraphData;
  }[];
  label?: string;
}

type BarConfig = {
  dataKey: keyof GraphData;
  name: string;
  fill: string;
  radius: [number, number, number, number];
};

export const Overview: React.FC<OverviewProps> = ({ data, year }) => {
  const barColor = useMemo(
    () => yearColors[year as keyof typeof yearColors] || yearColors.default,
    [year],
  );

  const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
    if (!active || !payload || !payload.length) return null;

    const subtotalPayload = payload.find((p) => p.dataKey === "subtotal");
    const discountsPayload = payload.find((p) => p.dataKey === "discounts");
    const couponDiscountsPayload = payload.find(
      (p) => p.dataKey === "couponDiscounts",
    );
    const totalPayload = payload.find((p) => p.dataKey === "total");

    return (
      <div className="custom-tooltip rounded-lg border bg-white p-4 shadow-lg">
        <p className="mb-2 font-bold">{label}</p>
        <p className="text-sm text-gray-600">
          {`Ingresos Brutos: ${currencyFormatter(subtotalPayload?.value ?? 0)}`}
        </p>
        {discountsPayload?.value && discountsPayload.value > 0 ? (
          <p className="text-sm text-red-600">
            {`Descuentos: -${currencyFormatter(discountsPayload.value)}`}
          </p>
        ) : null}
        {couponDiscountsPayload?.value && couponDiscountsPayload.value > 0 ? (
          <p className="text-sm text-orange-600">
            {`Cupones: -${currencyFormatter(couponDiscountsPayload.value)}`}
          </p>
        ) : null}
        <p className="mt-2 border-t pt-2 text-sm font-semibold text-green-600">
          {`Total Final: ${currencyFormatter(totalPayload?.value ?? 0)}`}
        </p>
      </div>
    );
  };

  const barConfigs: BarConfig[] = useMemo(
    () => [
      {
        dataKey: "subtotal",
        name: "Ingresos Brutos",
        fill: "#fea4c3",
        radius: [4, 4, 0, 0],
      },
      {
        dataKey: "discounts",
        name: "Descuentos",
        fill: "#ef4444",
        radius: [4, 4, 0, 0],
      },
      {
        dataKey: "couponDiscounts",
        name: "Cupones",
        fill: "#ffc105",
        radius: [4, 4, 0, 0],
      },
      {
        dataKey: "total",
        name: "Total Final",
        fill: barColor,
        radius: [4, 4, 0, 0],
      },
    ],
    [barColor],
  );

  return (
    <div className="w-full">
      <div className="w-full overflow-x-auto">
        <div className="w-full min-w-[1024px] md:min-w-full">
          <ResponsiveContainer width="100%" height={350}>
            <BarChart
              data={data}
              margin={{
                top: 20,
                right: 30,
                left: 20,
                bottom: 5,
              }}
            >
              <CartesianGrid strokeDasharray="3 3" />
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
              <Tooltip content={(props) => CustomTooltip(props as any)} />
              <Legend />
              {barConfigs.map((config) => (
                <Bar
                  key={config.dataKey}
                  dataKey={config.dataKey}
                  name={config.name}
                  fill={config.fill}
                  radius={config.radius}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="mt-2 flex justify-center sm:hidden">
        <div className="flex items-center space-x-1 text-xs text-muted-foreground">
          <span>←</span>
          <span>Desliza para ver más</span>
          <span>→</span>
        </div>
      </div>
    </div>
  );
};
