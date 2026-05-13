import { Banknote } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import type { CampusRow } from "@/hooks/my-school/useCampuses";

interface Props {
  campuses: CampusRow[] | undefined;
  isLoading: boolean;
}

export function TopCampusesList({ campuses, isLoading }: Props) {
  if (isLoading) {
    return <Skeleton className="h-72 rounded-xl" />;
  }

  const sorted = [...(campuses ?? [])].sort(
    (a, b) => b.incomePaise - a.incomePaise
  );

  return (
    <Card className="border-slate-200/80 bg-white shadow-none">
      <CardHeader className="border-b border-slate-100 px-4 py-3">
        <CardTitle className="text-sm font-semibold text-slate-900">
          Top Campuses by Revenue
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-sm text-slate-400">
            <Banknote className="h-8 w-8 text-slate-300" />
            <p>No campuses yet</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {sorted.map((campus, index) => (
              <li
                key={campus.id}
                className="flex items-center gap-3 px-4 py-3"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-600">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {campus.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {campus.studentCount} students
                  </p>
                </div>
                <p className="text-sm font-semibold text-emerald-600">
                  Rs. {(campus.incomePaise / 100).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
