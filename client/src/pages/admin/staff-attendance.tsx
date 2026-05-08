import { useState } from "react";
import { Layout } from "@/components/layout";
import { useStaffList, useMarkStaffAttendance, useGetStaffAttendance } from "@/hooks/use-staff";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Plus } from "lucide-react";

export default function StaffAttendancePage() {
  const { data: staff, isLoading } = useStaffList();
  const markAttendance = useMarkStaffAttendance();
  const [selectedStaff, setSelectedStaff] = useState<number | null>(null);
  const { data: records, isLoading: attLoading } = useGetStaffAttendance(selectedStaff!);

  const handleMark = (staffId: number, status: string) => {
    markAttendance.mutate({
      staffId,
      attendanceDate: new Date().toISOString().slice(0, 10),
      status,
    });
  };

  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="text-3xl font-bold">Staff Attendance</h1>

        <div className="bg-white dark:bg-card border rounded-2xl overflow-hidden shadow-sm">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Employee</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow><TableCell colSpan={3} className="text-center py-4"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
              ) : staff?.map(s => (
                <TableRow key={s.id}>
                  <TableCell>{s.firstName} {s.lastName}</TableCell>
                  <TableCell>{s.staffType}</TableCell>
                  <TableCell className="space-x-2">
                    <Button size="sm" variant="outline" onClick={() => handleMark(s.id, "Present")}>Present</Button>
                    <Button size="sm" variant="outline" onClick={() => handleMark(s.id, "Absent")}>Absent</Button>
                    <Button size="sm" onClick={() => setSelectedStaff(s.id)}>View</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {selectedStaff && (
          <div>
            <h2 className="text-xl font-semibold mb-4">Attendance Records</h2>
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Status</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {attLoading ? (
                  <TableRow><TableCell colSpan={2} className="text-center py-4"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></TableCell></TableRow>
                ) : records?.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell>{r.attendanceDate}</TableCell>
                    <TableCell>{r.status}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </Layout>
  );
}
