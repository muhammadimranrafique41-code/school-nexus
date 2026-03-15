import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TimetableSettingsProvider } from "@/lib/timetable-settings-bus";
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
import AdminClasses from "./pages/admin/classes";
import AdminClassDetail from "./pages/admin/class-detail";
import AdminTimetable from "./pages/admin/timetable";
import AdminHomeworkDiary from "./pages/admin/homework-diary";
import AdminDailyDiary from "./pages/admin/daily-diary";

import TeacherDashboard from "./pages/teacher/dashboard";
import TeacherAttendance from "./pages/teacher/attendance";
import TeacherQrCard from "./pages/teacher/qr-card";
import TeacherQrAttendance from "./pages/teacher/qr-attendance";
import TeacherResults from "./pages/teacher/results";
import TeacherTimetable from "./pages/teacher/timetable";
import TeacherHomeworkDashboard from "./pages/teacher/homework";
import TeacherHomeworkCreator from "./pages/teacher/homework/create";
import TeacherHomeworkSubmissions from "./pages/teacher/homework/submissions";

import StudentDashboard from "./pages/student/dashboard";
import StudentAttendance from "./pages/student/attendance";
import StudentGrades from "./pages/student/grades";
import StudentQrCard from "./pages/student/qr-card";
import StudentTimetable from "./pages/student/timetable";
import StudentFees from "./pages/student/fees";
import StudentHomeworkDiary from "./pages/student/homework-diary";
import StudentDailyDiary from "./pages/student/daily-diary";
import StudentTeacherHomework from "./pages/student/teacher-homework";

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
      <Route path="/admin/classes">
        <ProtectedRoute allowedRoles={['admin']}><AdminClasses /></ProtectedRoute>
      </Route>
      <Route path="/admin/classes/:id">
        <ProtectedRoute allowedRoles={['admin']}><AdminClassDetail /></ProtectedRoute>
      </Route>
      <Route path="/admin/timetable">
        <ProtectedRoute allowedRoles={['admin']}><AdminTimetable /></ProtectedRoute>
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
      <Route path="/admin/homework-diary">
        <ProtectedRoute allowedRoles={['admin']}><AdminHomeworkDiary /></ProtectedRoute>
      </Route>
      <Route path="/admin/daily-diary/:classId/:date">
        <ProtectedRoute allowedRoles={['admin']}><AdminDailyDiary /></ProtectedRoute>
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
      <Route path="/teacher/timetable">
        <ProtectedRoute allowedRoles={['teacher']}><TeacherTimetable /></ProtectedRoute>
      </Route>
      <Route path="/teacher/homework/new">
        <ProtectedRoute allowedRoles={['teacher']}><TeacherHomeworkCreator /></ProtectedRoute>
      </Route>
      <Route path="/teacher/homework/:id/edit">
        <ProtectedRoute allowedRoles={['teacher']}><TeacherHomeworkCreator /></ProtectedRoute>
      </Route>
      <Route path="/teacher/homework/:id/submissions">
        <ProtectedRoute allowedRoles={['teacher']}><TeacherHomeworkSubmissions /></ProtectedRoute>
      </Route>
      <Route path="/teacher/homework">
        <ProtectedRoute allowedRoles={['teacher']}><TeacherHomeworkDashboard /></ProtectedRoute>
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
      <Route path="/student/homework-diary">
        <ProtectedRoute allowedRoles={['student']}><StudentHomeworkDiary /></ProtectedRoute>
      </Route>
      <Route path="/student/teacher-homework">
        <ProtectedRoute allowedRoles={['student']}><StudentTeacherHomework /></ProtectedRoute>
      </Route>
      <Route path="/student/daily-diary/:date">
        <ProtectedRoute allowedRoles={['student']}><StudentDailyDiary /></ProtectedRoute>
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
        <TimetableSettingsProvider>
          <Toaster />
          <Router />
        </TimetableSettingsProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
