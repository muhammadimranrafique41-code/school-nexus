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
import BulkVouchersPage from "./pages/admin/finance/BulkVouchersPage";
import AdminQrAttendance from "./pages/admin/qr-attendance";
import AdminSettings from "./pages/admin/settings";
import CreateStudent from "./pages/admin/students";
import CreateTeacher from "./pages/admin/teachers";

import TeacherDashboard from "./pages/teacher/dashboard";
import TeacherAttendance from "./pages/teacher/attendance";
import TeacherQrCard from "./pages/teacher/qr-card";
import TeacherQrAttendance from "./pages/teacher/qr-attendance";
import TeacherResults from "./pages/teacher/results";

import StudentDashboard from "./pages/student/dashboard";
import StudentAttendance from "./pages/student/attendance";
import StudentGrades from "./pages/student/grades";
import StudentQrCard from "./pages/student/qr-card";
import StudentTimetable from "./pages/student/timetable";
import StudentFees from "./pages/student/fees";

import { ProtectedRoute } from "./components/protected-route";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />

      {/* Admin Routes */}
      <Route path="/admin/users">
        <ProtectedRoute allowedRoles={['admin']}><AdminUsers /></ProtectedRoute>
      </Route>
      <Route path="/admin/students/create">
        <ProtectedRoute allowedRoles={['admin']}><CreateStudent /></ProtectedRoute>
      </Route>
      <Route path="/admin/students">
        <ProtectedRoute allowedRoles={['admin']}><AdminUsers roleFilter="student" /></ProtectedRoute>
      </Route>
      <Route path="/admin/teachers/create">
        <ProtectedRoute allowedRoles={['admin']}><CreateTeacher /></ProtectedRoute>
      </Route>
      <Route path="/admin/teachers">
        <ProtectedRoute allowedRoles={['admin']}><AdminUsers roleFilter="teacher" /></ProtectedRoute>
      </Route>
      <Route path="/admin/academics">
        <ProtectedRoute allowedRoles={['admin']}><AdminAcademics /></ProtectedRoute>
      </Route>
      <Route path="/admin/finance/bulk-print">
        <ProtectedRoute allowedRoles={['admin']}><BulkVouchersPage /></ProtectedRoute>
      </Route>
      <Route path="/admin/finance">
        <ProtectedRoute allowedRoles={['admin']}><AdminFinance /></ProtectedRoute>
      </Route>
      <Route path="/admin/qr-attendance">
        <ProtectedRoute allowedRoles={['admin']}><AdminQrAttendance /></ProtectedRoute>
      </Route>
      <Route path="/admin/settings">
        <ProtectedRoute allowedRoles={['admin']}><AdminSettings /></ProtectedRoute>
      </Route>
      <Route path="/admin">
        <ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>
      </Route>

      {/* Teacher Routes */}
      <Route path="/teacher/attendance">
        <ProtectedRoute allowedRoles={['teacher']}><TeacherAttendance /></ProtectedRoute>
      </Route>
      <Route path="/teacher/qr-card">
        <ProtectedRoute allowedRoles={['teacher']}><TeacherQrCard /></ProtectedRoute>
      </Route>
      <Route path="/teacher/qr-attendance">
        <ProtectedRoute allowedRoles={['teacher']}><TeacherQrAttendance /></ProtectedRoute>
      </Route>
      <Route path="/teacher/results">
        <ProtectedRoute allowedRoles={['teacher']}><TeacherResults /></ProtectedRoute>
      </Route>
      <Route path="/teacher">
        <ProtectedRoute allowedRoles={['teacher']}><TeacherDashboard /></ProtectedRoute>
      </Route>

      {/* Student Routes */}
      <Route path="/student/attendance">
        <ProtectedRoute allowedRoles={['student']}><StudentAttendance /></ProtectedRoute>
      </Route>
      <Route path="/student/qr-card">
        <ProtectedRoute allowedRoles={['student']}><StudentQrCard /></ProtectedRoute>
      </Route>
      <Route path="/student/results">
        <ProtectedRoute allowedRoles={['student']}><StudentGrades /></ProtectedRoute>
      </Route>
      <Route path="/student/grades">
        <ProtectedRoute allowedRoles={['student']}><StudentGrades /></ProtectedRoute>
      </Route>
      <Route path="/student/timetable">
        <ProtectedRoute allowedRoles={['student']}><StudentTimetable /></ProtectedRoute>
      </Route>
      <Route path="/student/fees">
        <ProtectedRoute allowedRoles={['student']}><StudentFees /></ProtectedRoute>
      </Route>
      <Route path="/student">
        <ProtectedRoute allowedRoles={['student']}><StudentDashboard /></ProtectedRoute>
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
