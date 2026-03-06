import { Layout } from "@/components/layout";
import { useStudentStats } from "@/hooks/use-dashboard";
import { useResults } from "@/hooks/use-results";
import { useUser } from "@/hooks/use-auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Percent, Banknote, Loader2, Award } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function StudentDashboard() {
  const { data: user } = useUser();
  const { data: stats, isLoading: statsLoading } = useStudentStats(user?.id || 0);
  const { data: results, isLoading: resultsLoading } = useResults();

  if (statsLoading || resultsLoading) {
    return (
      <Layout>
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  const myRecentResults = results?.filter(r => r.studentId === user?.id).slice(0, 3) || [];

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Student Dashboard</h1>
          <p className="text-muted-foreground mt-1">Hello, {user?.name}. Here is your academic summary.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="border-none shadow-md shadow-black/5 hover-elevate transition-all duration-300 group">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Attendance Rate
              </CardTitle>
              <div className="bg-emerald-100 text-emerald-600 p-2.5 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <Percent className="h-5 w-5" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display">{stats?.attendanceRate || 0}%</div>
              <p className="text-sm text-muted-foreground mt-1">Current term</p>
            </CardContent>
          </Card>

          <Card className="border-none shadow-md shadow-black/5 hover-elevate transition-all duration-300 group">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Unpaid Fees
              </CardTitle>
              <div className="bg-rose-100 text-rose-600 p-2.5 rounded-xl group-hover:scale-110 transition-transform duration-300">
                <Banknote className="h-5 w-5" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold font-display text-rose-600">${(stats?.unpaidFees || 0).toLocaleString()}</div>
              <p className="text-sm text-muted-foreground mt-1">Requires attention</p>
            </CardContent>
          </Card>
        </div>

        <h2 className="text-xl font-display font-bold mt-8 mb-4">Recent Results</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {myRecentResults.length === 0 ? (
            <div className="col-span-3 text-center py-8 text-muted-foreground bg-white dark:bg-card rounded-2xl border">
              No recent grades available.
            </div>
          ) : (
            myRecentResults.map((res) => (
              <Card key={res.id} className="border border-border/50 shadow-sm relative overflow-hidden">
                <div className={`absolute top-0 left-0 w-1.5 h-full ${res.grade === 'A' ? 'bg-emerald-500' : res.grade === 'F' ? 'bg-red-500' : 'bg-primary'}`} />
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center justify-between">
                    {res.subject}
                    <Award className="h-4 w-4 text-muted-foreground" />
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-end gap-3">
                    <div className="text-3xl font-bold font-display">{res.marks}</div>
                    <div className="text-sm text-muted-foreground mb-1">/ 100</div>
                    <div className="ml-auto">
                      <Badge variant="outline" className="font-bold text-sm bg-slate-50">
                        Grade {res.grade}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>
    </Layout>
  );
}
