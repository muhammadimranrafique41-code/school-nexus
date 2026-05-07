import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ExamStatistics } from "../types";

export function SubjectAverageChart({ subjects }: { subjects: ExamStatistics["subjectAverages"] }) {
  return (
    <div className="h-64 rounded-lg border bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold">Subject Performance</h3>
      <ResponsiveContainer width="100%" height="90%">
        <BarChart data={subjects}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="subjectName" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Bar dataKey="average" fill="#0f766e" />
          <Bar dataKey="highest" fill="#7c3aed" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
