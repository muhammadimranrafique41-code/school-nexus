import { useState } from "react";
import { Edit, Eye, Trash2, MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { OwnerStatusBadge } from "@/components/super-admin/OwnerStatusBadge";
import type { OwnerRow } from "@/lib/api/superAdminApi";

interface OwnerTableProps {
  owners: OwnerRow[];
  isLoading: boolean;
  onEdit: (owner: OwnerRow) => void;
  onDelete: (owner: OwnerRow) => void;
  onView: (owner: OwnerRow) => void;
}

export function OwnerTable({ owners, isLoading, onEdit, onDelete, onView }: OwnerTableProps) {
  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>School Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Plan</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Campuses</TableHead>
          <TableHead>Students</TableHead>
          <TableHead>Pending Dues</TableHead>
          <TableHead className="w-16" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {owners.length === 0 ? (
          <TableRow>
            <TableCell colSpan={8} className="text-center text-slate-400 py-8">
              No owners found.
            </TableCell>
          </TableRow>
        ) : (
          owners.map((owner) => (
            <TableRow key={owner.id}>
              <TableCell className="font-medium">{owner.name}</TableCell>
              <TableCell className="text-slate-500">{owner.email}</TableCell>
              <TableCell>{owner.plan}</TableCell>
              <TableCell><OwnerStatusBadge status={owner.status} /></TableCell>
              <TableCell>{owner.campusCount}</TableCell>
              <TableCell>{owner.studentCount}</TableCell>
              <TableCell>Rs. {(owner.pendingDuesPaise / 100).toLocaleString()}</TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => onView(owner)}>
                      <Eye className="h-4 w-4 mr-2" />
                      View
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => onEdit(owner)}>
                      <Edit className="h-4 w-4 mr-2" />
                      Edit
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onDelete(owner)}
                      className="text-red-600"
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );
}
