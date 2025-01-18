"use client";

import { yearColors } from "@/constants";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Legend, Pie, PieChart, ResponsiveContainer, Sector } from "recharts";

interface InventoryByCategoryColumn {
  category: string;
  stock: number;
}

interface InventoryByCategoryProps {
  data: InventoryByCategoryColumn[];
}

const renderActiveShape = (props: any) => {
  const RADIAN = Math.PI / 180;
  const {
    cx = 0,
    cy = 0,
    midAngle = 0,
    innerRadius,
    outerRadius = 0,
    startAngle,
    endAngle,
    fill,
    payload,
    percent = 0,
    value,
  } = props;
  const sin = Math.sin(-RADIAN * midAngle);
  const cos = Math.cos(-RADIAN * midAngle);
  const sx = cx + (outerRadius + 10) * cos;
  const sy = cy + (outerRadius + 10) * sin;
  const mx = cx + (outerRadius + 30) * cos;
  const my = cy + (outerRadius + 30) * sin;
  const ex = mx + (cos >= 0 ? 1 : -1) * 22;
  const ey = my;
  const textAnchor = cos >= 0 ? "start" : "end";

  return (
    <g>
      <text x={cx} y={cy} dy={8} textAnchor="middle" fill={fill}>
        {payload.category}
      </text>
      <Sector
        cx={cx}
        cy={cy}
        innerRadius={innerRadius}
        outerRadius={outerRadius}
        startAngle={startAngle}
        endAngle={endAngle}
        fill={fill}
      />
      <Sector
        cx={cx}
        cy={cy}
        startAngle={startAngle}
        endAngle={endAngle}
        innerRadius={outerRadius + 6}
        outerRadius={outerRadius + 10}
        fill={fill}
      />
      <path
        d={`M${sx},${sy}L${mx},${my}L${ex},${ey}`}
        stroke={fill}
        fill="none"
      />
      <circle cx={ex} cy={ey} r={2} fill={fill} stroke="none" />
      <text
        x={ex + (cos >= 0 ? 1 : -1) * 12}
        y={ey}
        textAnchor={textAnchor}
        fill={yearColors[2025]}
      >{`${value} unidades`}</text>
      <text
        x={ex + (cos >= 0 ? 1 : -1) * 12}
        y={ey}
        dy={18}
        textAnchor={textAnchor}
        fill="#999"
      >
        {`(${(percent * 100).toFixed(2)}% del total)`}
      </text>
    </g>
  );
};

export const InventoryByCategory: React.FC<InventoryByCategoryProps> = ({
  data,
}) => {
  const searchParams = useSearchParams();
  const [activeIndex, setActiveIndex] = useState(0);

  const year = searchParams.get("year");
  const yearIndex = year ? parseInt(year) : new Date().getFullYear();

  const color =
    yearColors[yearIndex as keyof typeof yearColors] || yearColors.default;

  const onPieEnter = (_: unknown, index: number) => {
    setActiveIndex(index);
  };

  return (
    <ResponsiveContainer width="100%" height="100%">
      <PieChart>
        <Pie
          activeIndex={activeIndex}
          activeShape={renderActiveShape}
          data={data}
          dataKey="stock"
          nameKey="category"
          onMouseEnter={onPieEnter}
          innerRadius={180}
          outerRadius={220}
          cx="50%"
          cy="50%"
          fill={color}
        />
        <Legend onMouseEnter={onPieEnter} />
      </PieChart>
    </ResponsiveContainer>
  );
};
