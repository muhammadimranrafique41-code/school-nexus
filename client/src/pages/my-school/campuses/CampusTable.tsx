import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useState } from "react";
import { ExternalLink, Pencil, Trash2 } from "lucide-react";
import { CampusStatusBadge } from "@/components/my-school/CampusStatusBadge";
import type { CampusRow } from "@/hooks/my-school/useCampuses";

interface Props {
  campuses: CampusRow[] | undefined;
  isLoading: boolean;
  onEdit: (campus: CampusRow) => void;
  onDelete: (id: number) => void;
  onManage: (id: number) => void;
  filterCampusId: number | null;
}

function formatPaise(paise: number) {
  return `Rs. ${(paise / 100).toLocaleString()}`;
}

export function CampusTable({
  campuses,
  isLoading,
  onEdit,
  onDelete,
  onManage,
  filterCampusId,
}: Props) {
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const filtered = filterCampusId
    ? (campuses ?? []).filter((c) => c.id === filterCampusId)
    : campuses;

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (!filtered || filtered.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-12 text-sm text-slate-400">
        <p className="text-lg font-medium">No campuses found</p>
        <p>Create your first campus to get started.</p>
      </div>
    );
  }

  return (
    <>
      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead className="text-xs font-semibold uppercase text-slate-500">
                Campus
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-500">
                Students
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-500">
                Staff
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-500">
                Families
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-500">
                Income
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-500">
                Expenses
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-500">
                Pending Dues
              </TableHead>
              <TableHead className="text-xs font-semibold uppercase text-slate-500">
                Status
              </TableHead>
              <TableHead className="w-24 text-xs font-semibold uppercase text-slate-500">
                Actions
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((campus) => (
              <TableRow key={campus.id} className="hover:bg-slate-50">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-50 text-xs font-bold text-indigo-700">
                      {campus.name.charAt(0)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {campus.name}
                      </p>
                      <p className="text-xs text-slate-500">
                        {campus.subdomain}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-sm font-medium text-slate-900">
                  {campus.studentCount}
                </TableCell>
                <TableCell className="text-sm text-slate-700">
                  {campus.staffCount}
                </TableCell>
                <TableCell className="text-sm text-slate-700">
                  {campus.familyCount}
                </TableCell>
                <TableCell className="text-sm font-medium text-emerald-600">
                  {formatPaise(campus.incomePaise)}
                </TableCell>
                <TableCell className="text-sm font-medium text-red-600">
                  {formatPaise(campus.expensesPaise)}
                </TableCell>
                <TableCell className="text-sm font-medium text-orange-600">
                  {formatPaise(campus.pendingDuesPaise)}
                </TableCell>
                <TableCell>
                  <CampusStatusBadge isActive={campus.isActive} />
                </TableCell>
                <TableCell>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onEdit(campus)}
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4 text-slate-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => setDeleteId(campus.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      onClick={() => onManage(campus.id)}
                    >
                      <ExternalLink className="h-3 w-3" />
                      Manage
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <AlertDialog
        open={deleteId !== null}
        onOpenChange={() => setDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete this campus and all associated billing
              records. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteId !== null) {
                  onDelete(deleteId);
                  setDeleteId(null);
                }
              }}
              className="bg-red-600 hover:bg-red-500"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
