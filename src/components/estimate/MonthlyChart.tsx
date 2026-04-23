"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MonthlyBreakdown } from "@/lib/intel/types";
import { formatGBP, formatPercent } from "@/lib/intel/format";

export function MonthlyChart({ data }: { data: MonthlyBreakdown[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="rgba(93,129,86,0.15)" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fill: "#9ba896", fontSize: 12 }}
            axisLine={{ stroke: "rgba(93,129,86,0.2)" }}
            tickLine={false}
          />
          <YAxis
            yAxisId="rev"
            tick={{ fill: "#9ba896", fontSize: 12 }}
            axisLine={{ stroke: "rgba(93,129,86,0.2)" }}
            tickLine={false}
            tickFormatter={(v) => `£${Math.round(v / 1000)}k`}
          />
          <YAxis
            yAxisId="occ"
            orientation="right"
            tick={{ fill: "#9ba896", fontSize: 12 }}
            axisLine={{ stroke: "rgba(93,129,86,0.2)" }}
            tickLine={false}
            domain={[0, 1]}
            tickFormatter={(v) => `${Math.round(v * 100)}%`}
          />
          <Tooltip
            cursor={{ fill: "rgba(93,129,86,0.08)" }}
            contentStyle={{
              background: "#111a0f",
              border: "1px solid rgba(93,129,86,0.3)",
              borderRadius: 8,
              fontSize: 12,
              color: "#f0ede4",
            }}
            formatter={(value, name) => {
              const v = typeof value === "number" ? value : Number(value);
              if (!Number.isFinite(v)) return [String(value), String(name)];
              if (name === "Revenue") return [formatGBP(v), String(name)];
              if (name === "Occupancy") return [formatPercent(v), String(name)];
              if (name === "ADR") return [formatGBP(v), String(name)];
              return [String(value), String(name)];
            }}
          />
          <Bar
            yAxisId="rev"
            dataKey="revenue"
            name="Revenue"
            fill="#5d8156"
            radius={[6, 6, 0, 0]}
          />
          <Line
            yAxisId="occ"
            type="monotone"
            dataKey="occupancy"
            name="Occupancy"
            stroke="#b9d5c6"
            strokeWidth={2}
            dot={{ r: 3, fill: "#b9d5c6" }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
