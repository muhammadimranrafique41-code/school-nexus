import { useAdminStats } from "@/hooks/use-dashboard";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, BookOpen, GraduationCap, Banknote, Loader2 } from "lucide-react";

export default function AdminDashboard() {
  const { data: stats, isLoading } = useAdminStats();

  if (isLoading) {
    return (
      <Layout>
        <div className="flex h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  const statCards = [
    { title: "Total Students", value: stats?.totalStudents || 0, icon: GraduationCap, color: "text-blue-600", bg: "bg-blue-100" },
    { title: "Total Teachers", value: stats?.totalTeachers || 0, icon: Users, color: "text-emerald-600", bg: "bg-emerald-100" },
    { title: "Fees Collected", value: `$${(stats?.feesCollected || 0).toLocaleString()}`, icon: Banknote, color: "text-violet-600", bg: "bg-violet-100" },
    { title: "Active Classes", value: stats?.activeClasses || 0, icon: BookOpen, color: "text-amber-600", bg: "bg-amber-100" },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Admin Dashboard</h1>
          <p className="text-muted-foreground mt-1">Overview of your school's current status.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {statCards.map((stat, index) => (
            <Card key={index} className="border-none shadow-md shadow-black/5 hover-elevate transition-all duration-300 group">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className={`${stat.bg} ${stat.color} p-2.5 rounded-xl group-hover:scale-110 transition-transform duration-300`}>
                  <stat.icon className="h-5 w-5" />
                </div>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold font-display">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </Layout>
  );
}
