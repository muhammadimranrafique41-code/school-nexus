import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { AuditLogEntry } from "@/lib/api/superAdminApi";

interface AuditLogTableProps {
  logs: AuditLogEntry[];
  isLoading: boolean;
}

export function AuditLogTable({ logs, isLoading }: AuditLogTableProps) {
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
          <TableHead className="w-8" />
          <TableHead>Timestamp</TableHead>
          <TableHead>Actor</TableHead>
          <TableHead>Action</TableHead>
          <TableHead>Entity Type</TableHead>
          <TableHead>Target</TableHead>
          <TableHead>IP Address</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {logs.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-slate-400 py-8">
              No audit logs found.
            </TableCell>
          </TableRow>
        ) : (
          logs.map((log) => (
            <AuditLogRow key={log.id} log={log} />
          ))
        )}
      </TableBody>
    </Table>
  );
}

function AuditLogRow({ log }: { log: AuditLogEntry }) {
  const [open, setOpen] = useState(false);

  return (
    <Collapsible asChild open={open} onOpenChange={setOpen}>
      <>
        <TableRow>
          <TableCell>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              </Button>
            </CollapsibleTrigger>
          </TableCell>
          <TableCell className="text-xs text-slate-500">
            {new Date(log.createdAt).toLocaleString()}
          </TableCell>
          <TableCell className="text-sm">
            {log.actorRole}
            {log.actorId ? ` #${log.actorId}` : ""}
          </TableCell>
          <TableCell>
            <code className="rounded bg-slate-100 px-2 py-0.5 text-xs font-mono text-slate-700">
              {log.action}
            </code>
          </TableCell>
          <TableCell className="text-sm text-slate-600">{log.entityType}</TableCell>
          <TableCell className="text-sm text-slate-600">
            {log.targetOwnerId ? `Owner #${log.targetOwnerId}` : "—"}
          </TableCell>
          <TableCell className="text-xs text-slate-400">{log.ipAddress ?? "—"}</TableCell>
        </TableRow>
        <CollapsibleContent>
          <TableRow>
            <TableCell colSpan={7} className="bg-slate-50 p-4">
              <div className="space-y-1">
                <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Metadata</p>
                <pre className="rounded bg-slate-800 p-3 text-xs text-slate-200 overflow-auto max-h-48">
                  {JSON.stringify(log.metadata, null, 2)}
                </pre>
              </div>
            </TableCell>
          </TableRow>
        </CollapsibleContent>
      </>
    </Collapsible>
  );
}
