import { Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function PerformanceTrendChart({ data }: { data: { label: string; percentage: number }[] }) {
  return (
    <div className="h-56 rounded-lg border bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold">Performance Trend</h3>
      <ResponsiveContainer width="100%" height="90%">
        <LineChart data={data}>
          <XAxis dataKey="label" />
          <YAxis domain={[0, 100]} />
          <Tooltip />
          <Line type="monotone" dataKey="percentage" stroke="#111827" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
