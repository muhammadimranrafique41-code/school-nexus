import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TimetableSettingsProvider } from "@/lib/timetable-settings-bus";
import { UiStateProvider } from "@/hooks/useUiState";
import { Header } from "@/components/layout/Header";
import { SideNav } from "@/components/layout/SideNav";
import NotFound from "@/pages/not-found";

import Login from "./pages/login";
import DashboardPage from "./pages/DashboardPage";
import AttendancePage from "./pages/AttendancePage";
import FinancePage from "./pages/FinancePage";
import HomeworkPage from "./pages/HomeworkPage";
import AdminDashboard from "./pages/admin/dashboard";
import AdminUsers from "./pages/admin/users";
import AdminAcademics from "./pages/admin/academics";
import AdminFinance from "./pages/admin/finance";
import BulkVouchersPage from "./pages/admin/finance/BulkVouchersPage";
import MonthSelectorPage from "./pages/admin/finance/vouchers/MonthSelectorPage";
import StudentPreviewPage from "./pages/admin/finance/vouchers/StudentPreviewPage";
import FamilyVoucherPage from "./pages/admin/finance/vouchers/FamilyVoucherPage";
import WalletManagementHub from "./pages/admin/finance/WalletManagementHub";
import StudentStatementPage from "./pages/admin/finance/StudentStatementPage";
import AdminQrAttendance from "./pages/admin/qr-attendance";
import AdminSettings from "./pages/admin/settings";
import CreateStudent from "./pages/admin/students";
import CreateTeacher from "./pages/admin/teachers";
import AdminStaff from "./pages/admin/staff";
import AdminStaffSalary from "./pages/admin/staff-salary";
import AdminStaffLoans from "./pages/admin/staff-loans";
import AdminStaffAttendance from "./pages/admin/staff-attendance";
import PayrollPage from "./pages/payroll-page";
import AdminClasses from "./pages/admin/classes";
import AdminClassDetail from "./pages/admin/class-detail";
import AdminSubjects from "./pages/admin/subjects";
import AdminSessions from "./pages/admin/sessions";
import AdminPromotions from "./pages/admin/promotions";
import AdminTimetable from "./pages/admin/timetable";
import AdminHomeworkDiary from "./pages/admin/homework-diary";
import AdminDailyDiary from "./pages/admin/daily-diary";
import AdminStudentProfile from "./pages/admin/student-profile";
import AdminFamiliesPage from "./pages/admin/families";
import AdminReportsPage from "./pages/admin/reports";
import FinancialReportsPage from "./pages/admin/financial-reports";
import ActivityLogsPage from "./pages/admin/activity-logs";
import AiAssistantPage from "./pages/ai-assistant";
import TodosPage from "./pages/TodosPage";
import WhatsappPage from "./pages/admin/whatsapp";
import ExaminationPage from "./features/examination/ExaminationPage";
import LedgerPage from "./features/ledger/LedgerPage";

import OverviewPage from "./pages/my-school/overview/OverviewPage";
import CampusesPage from "./pages/my-school/campuses/CampusesPage";
import BillingPage from "./pages/my-school/billing/BillingPage";

import { useUser } from "@/hooks/use-auth";

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
import StudentFamilyPage from "./pages/student/family";

import { ProtectedRoute } from "./components/protected-route";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={Login} />

      {/* PRD Module Routes */}
      <Route path="/dashboard">
        <UiStateProvider>
          <div className="flex h-screen w-full overflow-hidden bg-slate-50">
            <SideNav />
            <div className="flex flex-1 flex-col min-w-0">
              <Header />
              <main className="flex-1 overflow-y-auto p-5">
                <DashboardPage />
              </main>
            </div>
          </div>
        </UiStateProvider>
      </Route>

      <Route path="/attendance">
        <UiStateProvider>
          <div className="flex h-screen w-full overflow-hidden bg-slate-50">
            <SideNav />
            <div className="flex flex-1 flex-col min-w-0">
              <Header />
              <main className="flex-1 overflow-y-auto p-5">
                <AttendancePage />
              </main>
            </div>
          </div>
        </UiStateProvider>
      </Route>
      <Route path="/finance">
        <UiStateProvider>
          <div className="flex h-screen w-full overflow-hidden bg-slate-50">
            <SideNav />
            <div className="flex flex-1 flex-col min-w-0">
              <Header />
              <main className="flex-1 overflow-y-auto p-5">
                <FinancePage />
              </main>
            </div>
          </div>
        </UiStateProvider>
      </Route>
      <Route path="/homework">
        <UiStateProvider>
          <div className="flex h-screen w-full overflow-hidden bg-slate-50">
            <SideNav />
            <div className="flex flex-1 flex-col min-w-0">
              <Header />
              <main className="flex-1 overflow-y-auto p-5">
                <HomeworkPage />
              </main>
            </div>
          </div>
        </UiStateProvider>
      </Route>

      {/* Admin Routes */}
      <Route path="/admin/todos">
        <ProtectedRoute allowedRoles={['admin']}><TodosPage /></ProtectedRoute>
      </Route>
      <Route path="/admin/users">
        <ProtectedRoute allowedRoles={['admin']}><AdminUsers /></ProtectedRoute>
      </Route>
      <Route path="/admin/ai-assistant">
        <ProtectedRoute allowedRoles={['admin']}><AiAssistantPage /></ProtectedRoute>
      </Route>
      <Route path="/admin/whatsapp">
        <ProtectedRoute allowedRoles={['admin']}><WhatsappPage /></ProtectedRoute>
      </Route>
      <Route path="/admin/students/create">
        <ProtectedRoute allowedRoles={['admin']}><CreateStudent /></ProtectedRoute>
      </Route>
      <Route path="/admin/students/:id">
        <ProtectedRoute allowedRoles={['admin']}><AdminStudentProfile /></ProtectedRoute>
      </Route>
      <Route path="/admin/students">
        <ProtectedRoute allowedRoles={['admin']}><AdminUsers roleFilter="student" /></ProtectedRoute>
      </Route>
      <Route path="/admin/families">
        <ProtectedRoute allowedRoles={['admin']}><AdminFamiliesPage /></ProtectedRoute>
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
      <Route path="/admin/subjects">
        <ProtectedRoute allowedRoles={['admin']}><AdminSubjects /></ProtectedRoute>
      </Route>
      <Route path="/admin/sessions">
        <ProtectedRoute allowedRoles={['admin']}><AdminSessions /></ProtectedRoute>
      </Route>
      <Route path="/admin/promotions">
        <ProtectedRoute allowedRoles={['admin']}><AdminPromotions /></ProtectedRoute>
      </Route>
      <Route path="/admin/timetable">
        <ProtectedRoute allowedRoles={['admin']}><AdminTimetable /></ProtectedRoute>
      </Route>
      <Route path="/examination">
        <ProtectedRoute allowedRoles={['admin', 'teacher']}><ExaminationPage /></ProtectedRoute>
      </Route>
      <Route path="/admin/ledger">
        <ProtectedRoute allowedRoles={['admin']}><LedgerPage /></ProtectedRoute>
      </Route>
      <Route path="/admin/finance/wallets">
        <ProtectedRoute allowedRoles={['admin']}><WalletManagementHub /></ProtectedRoute>
      </Route>
      <Route path="/admin/finance/statement/:studentId">
        <ProtectedRoute allowedRoles={['admin']}><StudentStatementPage /></ProtectedRoute>
      </Route>
      <Route path="/admin/finance/bulk-print">
        <ProtectedRoute allowedRoles={['admin']}><BulkVouchersPage /></ProtectedRoute>
      </Route>
      <Route path="/admin/finance/vouchers/family/:familyId">
        <ProtectedRoute allowedRoles={['admin']}><FamilyVoucherPage /></ProtectedRoute>
      </Route>
      <Route path="/admin/finance/vouchers/preview">
        <ProtectedRoute allowedRoles={['admin']}><StudentPreviewPage /></ProtectedRoute>
      </Route>
      <Route path="/admin/finance/vouchers/generate">
        <ProtectedRoute allowedRoles={['admin']}><MonthSelectorPage /></ProtectedRoute>
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
      <Route path="/admin/reports">
        <ProtectedRoute allowedRoles={['admin']}><AdminReportsPage /></ProtectedRoute>
      </Route>
      <Route path="/admin/activity-logs">
        <ProtectedRoute allowedRoles={['admin']}><ActivityLogsPage /></ProtectedRoute>
      </Route>
      <Route path="/admin/reports/financial">
        <ProtectedRoute allowedRoles={['admin', 'teacher']}><FinancialReportsPage /></ProtectedRoute>
      </Route>
      <Route path="/admin">
        <ProtectedRoute allowedRoles={['admin']}><AdminDashboard /></ProtectedRoute>
      </Route>

      <Route path="/admin/staff">
        <ProtectedRoute allowedRoles={['admin']}><AdminStaff /></ProtectedRoute>
      </Route>
      <Route path="/admin/staff-salary">
        <ProtectedRoute allowedRoles={['admin']}><AdminStaffSalary /></ProtectedRoute>
      </Route>
      <Route path="/admin/staff-loans">
        <ProtectedRoute allowedRoles={['admin']}><AdminStaffLoans /></ProtectedRoute>
      </Route>
      <Route path="/admin/staff-attendance">
        <ProtectedRoute allowedRoles={['admin']}><AdminStaffAttendance /></ProtectedRoute>
      </Route>
      <Route path="/admin/payroll-dashboard">
        <ProtectedRoute allowedRoles={['admin']}><PayrollPage /></ProtectedRoute>
      </Route>

      {/* Teacher Routes */}
      <Route path="/teacher/todos">
        <ProtectedRoute allowedRoles={['teacher']}><TodosPage /></ProtectedRoute>
      </Route>
      <Route path="/teacher/attendance">
        <ProtectedRoute allowedRoles={['teacher']}><TeacherAttendance /></ProtectedRoute>
      </Route>
      <Route path="/teacher/ai-assistant">
        <ProtectedRoute allowedRoles={['teacher']}><AiAssistantPage /></ProtectedRoute>
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
      <Route path="/teacher/homework-dairy">
        <ProtectedRoute allowedRoles={['teacher']}><TeacherHomeworkDashboard /></ProtectedRoute>
      </Route>
      <Route path="/teacher">
        <ProtectedRoute allowedRoles={['teacher']}><TeacherDashboard /></ProtectedRoute>
      </Route>

      {/* Student Routes */}
      <Route path="/student/todos">
        <ProtectedRoute allowedRoles={['student']}><TodosPage /></ProtectedRoute>
      </Route>
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
      <Route path="/student/statement">
        <ProtectedRoute allowedRoles={['student']}><StudentStatementPage /></ProtectedRoute>
      </Route>
      <Route path="/student/family">
        <ProtectedRoute allowedRoles={['student']}><StudentFamilyPage /></ProtectedRoute>
      </Route>
      <Route path="/student/homework">
        <ProtectedRoute allowedRoles={['student']}><StudentHomeworkDiary /></ProtectedRoute>
      </Route>
      <Route path="/student/daily-diary/:date">
        <ProtectedRoute allowedRoles={['student']}><StudentDailyDiary /></ProtectedRoute>
      </Route>
      <Route path="/student">
        <ProtectedRoute allowedRoles={['student']}><StudentDashboard /></ProtectedRoute>
      </Route>

      {/* My School Routes — uses same admin layout as all other pages */}
      <Route path="/my-school/overview">
        <ProtectedRoute allowedRoles={['admin']}>
          <UiStateProvider>
            <div className="flex h-screen w-full overflow-hidden bg-slate-50">
              <SideNav />
              <div className="flex flex-1 flex-col min-w-0">
                <Header />
                <main className="flex-1 overflow-y-auto p-6">
                  <OverviewPage />
                </main>
              </div>
            </div>
          </UiStateProvider>
        </ProtectedRoute>
      </Route>
      <Route path="/my-school/campuses">
        <ProtectedRoute allowedRoles={['admin']}>
          <UiStateProvider>
            <div className="flex h-screen w-full overflow-hidden bg-slate-50">
              <SideNav />
              <div className="flex flex-1 flex-col min-w-0">
                <Header />
                <main className="flex-1 overflow-y-auto p-6">
                  <CampusesPage />
                </main>
              </div>
            </div>
          </UiStateProvider>
        </ProtectedRoute>
      </Route>
      <Route path="/my-school/billing">
        <ProtectedRoute allowedRoles={['admin']}>
          <UiStateProvider>
            <div className="flex h-screen w-full overflow-hidden bg-slate-50">
              <SideNav />
              <div className="flex flex-1 flex-col min-w-0">
                <Header />
                <main className="flex-1 overflow-y-auto p-6">
                  <BillingPage />
                </main>
              </div>
            </div>
          </UiStateProvider>
        </ProtectedRoute>
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
