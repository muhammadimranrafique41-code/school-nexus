import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CalendarDays, GraduationCap, Users } from "lucide-react";
import { useUser } from "@/hooks/use-auth";

export default function TeacherDashboard() {
  const { data: user } = useUser();

  const statCards = [
    { title: "My Subject", value: user?.subject || "Not assigned", icon: GraduationCap, color: "text-blue-600", bg: "bg-blue-100" },
    { title: "Today's Classes", value: "3", icon: CalendarDays, color: "text-emerald-600", bg: "bg-emerald-100" },
    { title: "Students Monitored", value: "45", icon: Users, color: "text-violet-600", bg: "bg-violet-100" },
  ];

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Teacher Dashboard</h1>
          <p className="text-muted-foreground mt-1">Welcome back, {user?.name}. Here's your overview.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
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
                <div className="text-2xl font-bold font-display">{stat.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>
        
        <Card className="border-none shadow-md shadow-black/5 mt-8 overflow-hidden relative">
          <div className="absolute top-0 left-0 w-1 bg-primary h-full"></div>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="flex gap-4">
            <a href="/teacher/attendance" className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-8 text-sm font-semibold text-primary-foreground shadow hover:bg-primary/90 transition-colors">Mark Attendance</a>
            <a href="/teacher/results" className="inline-flex h-10 items-center justify-center rounded-xl border border-input bg-background px-8 text-sm font-semibold shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors">Add Results</a>
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
