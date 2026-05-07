import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export function GradeDistributionChart({ distribution }: { distribution: Record<string, number> }) {
  const data = Object.entries(distribution).map(([grade, count]) => ({ grade, count }));
  return (
    <div className="h-64 rounded-lg border bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold">Grade Distribution</h3>
      <ResponsiveContainer width="100%" height="90%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="grade" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="count" fill="#2563eb" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
