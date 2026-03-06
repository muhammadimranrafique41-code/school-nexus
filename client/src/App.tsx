import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import Login from "./pages/login";
import AdminDashboard from "./pages/admin/dashboard";
import AdminUsers from "./pages/admin/users";
import AdminAcademics from "./pages/admin/academics";
import AdminFinance from "./pages/admin/finance";

import TeacherDashboard from "./pages/teacher/dashboard";
import TeacherAttendance from "./pages/teacher/attendance";
import TeacherResults from "./pages/teacher/results";

import StudentDashboard from "./pages/student/dashboard";
import StudentAttendance from "./pages/student/attendance";
import StudentGrades from "./pages/student/grades";
import StudentFees from "./pages/student/fees";

import { ProtectedRoute } from "./components/protected-route";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />

      {/* Admin Routes */}
      <Route path="/admin">
        <ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>
      </Route>
      <Route path="/admin/users">
        <ProtectedRoute allowedRoles={['admin']}><AdminUsers /></ProtectedRoute>
      </Route>
      <Route path="/admin/academics">
        <ProtectedRoute allowedRoles={['admin']}><AdminAcademics /></ProtectedRoute>
      </Route>
      <Route path="/admin/finance">
        <ProtectedRoute allowedRoles={['admin']}><AdminFinance /></ProtectedRoute>
      </Route>

      {/* Teacher Routes */}
      <Route path="/teacher">
        <ProtectedRoute allowedRoles={['teacher']}><TeacherDashboard /></ProtectedRoute>
      </Route>
      <Route path="/teacher/attendance">
        <ProtectedRoute allowedRoles={['teacher']}><TeacherAttendance /></ProtectedRoute>
      </Route>
      <Route path="/teacher/results">
        <ProtectedRoute allowedRoles={['teacher']}><TeacherResults /></ProtectedRoute>
      </Route>

      {/* Student Routes */}
      <Route path="/student">
        <ProtectedRoute allowedRoles={['student']}><StudentDashboard /></ProtectedRoute>
      </Route>
      <Route path="/student/attendance">
        <ProtectedRoute allowedRoles={['student']}><StudentAttendance /></ProtectedRoute>
      </Route>
      <Route path="/student/grades">
        <ProtectedRoute allowedRoles={['student']}><StudentGrades /></ProtectedRoute>
      </Route>
      <Route path="/student/fees">
        <ProtectedRoute allowedRoles={['student']}><StudentFees /></ProtectedRoute>
      </Route>

      {/* Root - redirects to proper dashboard via ProtectedRoute logic */}
      <Route path="/">
        <ProtectedRoute><div /></ProtectedRoute>
      </Route>

      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
