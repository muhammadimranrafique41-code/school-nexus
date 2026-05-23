import { useState } from "react";
import { format } from "date-fns";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollText } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "@/hooks/use-toast";
import { useActivityLogs, useActivityLogDetail, usePruneActivityLogs, type ActivityLog, type ActivityLogAction } from "@/hooks/use-activity-logs";

const actionColors: Record<ActivityLogAction, string> = {
  CREATE: "bg-green-500",
  UPDATE: "bg-blue-500",
  DELETE: "bg-red-500",
  LOGIN: "bg-purple-500",
  LOGOUT: "bg-gray-500",
  EXPORT: "bg-orange-500",
  VIEW: "bg-gray-400",
  APPROVE: "bg-teal-500",
  REJECT: "bg-yellow-500",
};

const actionLabels: Record<ActivityLogAction, string> = {
  CREATE: "Created",
  UPDATE: "Updated",
  DELETE: "Deleted",
  LOGIN: "Logged In",
  LOGOUT: "Logged Out",
  EXPORT: "Exported",
  VIEW: "Viewed",
  APPROVE: "Approved",
  REJECT: "Rejected",
};

const actions: ActivityLogAction[] = ["CREATE", "UPDATE", "DELETE", "LOGIN", "LOGOUT", "EXPORT", "VIEW", "APPROVE", "REJECT"];

export default function ActivityLogsPage() {
  const [filters, setFilters] = useState({
    page: 1,
    limit: 20,
    action: "" as ActivityLogAction | "",
    userEmail: "",
    entityType: "",
    startDate: "",
    endDate: "",
  });

  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  const [showPruneDialog, setShowPruneDialog] = useState(false);
  const [retentionDays, setRetentionDays] = useState(365);

  const { data: logsData, isLoading, refetch } = useActivityLogs({
    ...filters,
    action: filters.action || undefined,
    startDate: filters.startDate || undefined,
    endDate: filters.endDate || undefined,
  });

  const { data: selectedLog, isLoading: isLoadingDetail } = useActivityLogDetail(selectedLogId);
  const pruneMutation = usePruneActivityLogs();

  const handlePageChange = (newPage: number) => {
    setFilters((prev) => ({ ...prev, page: newPage }));
  };

  const handleFilterChange = (key: string, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value, page: 1 }));
  };

  const handleViewDetails = (log: ActivityLog) => {
    setSelectedLogId(log.id);
  };

  const handlePrune = async () => {
    try {
      const result = await pruneMutation.mutateAsync(retentionDays);
      toast({
        title: "Pruning Complete",
        description: `Deleted ${result.deleted} old activity logs.`,
        variant: "default",
      });
      setShowPruneDialog(false);
      refetch();
    } catch {
      toast({
        title: "Error",
        description: "Failed to prune activity logs.",
        variant: "destructive",
      });
    }
  };

  const logs = logsData?.logs ?? [];
  const total = logsData?.total ?? 0;
  const totalPages = logsData?.totalPages ?? 1;

  return (
    <Layout>
      <div className="container mx-auto p-4 md:p-6 space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-md shadow-indigo-200">
              <ScrollText className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Activity Logs</h1>
              <p className="text-[12px] text-slate-400">Audit trail for accountability and security</p>
            </div>
          </div>
          <Button variant="outline" onClick={() => setShowPruneDialog(true)}>
            Prune Old Logs
          </Button>
        </div>

        <Card className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div className="space-y-2">
                <Label>Action</Label>
                <Select value={filters.action || "__all"} onValueChange={(v) => handleFilterChange("action", v === "__all" ? "" : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="All Actions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">All Actions</SelectItem>
                    {actions.map((action) => (
                      <SelectItem key={action} value={action}>
                        {actionLabels[action]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>User Email</Label>
                <Input
                  placeholder="Search by email..."
                  value={filters.userEmail}
                  onChange={(e) => handleFilterChange("userEmail", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Entity Type</Label>
                <Input
                  placeholder="e.g., student, fee"
                  value={filters.entityType}
                  onChange={(e) => handleFilterChange("entityType", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input
                  type="date"
                  value={filters.startDate}
                  onChange={(e) => handleFilterChange("startDate", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input
                  type="date"
                  value={filters.endDate}
                  onChange={(e) => handleFilterChange("endDate", e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>Per Page</Label>
                <Select
                  value={String(filters.limit)}
                  onValueChange={(v) => handleFilterChange("limit", v)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="20">20</SelectItem>
                    <SelectItem value="50">50</SelectItem>
                    <SelectItem value="100">100</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-xl border border-slate-200/80 bg-white shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Entity</TableHead>
                  <TableHead>IP Address</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 10 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }).map((_, j) => (
                        <TableCell key={j}>
                          <Skeleton className="h-4 w-full" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : logs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      No activity logs found
                    </TableCell>
                  </TableRow>
                ) : (
                  logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(log.createdAt), "yyyy-MM-dd HH:mm:ss")}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{log.userEmail}</span>
                          <span className="text-xs text-muted-foreground">{log.userRole}</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge className={actionColors[log.action]}>{actionLabels[log.action]}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span className="text-sm">{log.entityType}</span>
                          {log.entityId && <span className="text-xs text-muted-foreground">ID: {log.entityId}</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{log.ipAddress ?? "-"}</TableCell>
                      <TableCell className="text-sm">{log.durationMs ? `${log.durationMs}ms` : "-"}</TableCell>
                      <TableCell>
                        {log.statusCode && (
                          <Badge variant={log.statusCode < 400 ? "default" : "destructive"}>
                            {log.statusCode}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" onClick={() => handleViewDetails(log)}>
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => handlePageChange(filters.page - 1)} disabled={filters.page <= 1}>
              Previous
            </Button>
            <span className="text-sm">
              Page {filters.page} of {totalPages} ({total} total)
            </span>
            <Button variant="outline" size="sm" onClick={() => handlePageChange(filters.page + 1)} disabled={filters.page >= totalPages}>
              Next
            </Button>
          </div>
        )}

        {/* Detail Dialog */}
        <Dialog open={selectedLogId !== null} onOpenChange={() => setSelectedLogId(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Activity Log Details</DialogTitle>
              <DialogDescription>Detailed information about this activity</DialogDescription>
            </DialogHeader>
            {isLoadingDetail ? (
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ) : selectedLog ? (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-muted-foreground">ID</Label>
                    <p className="font-mono">{selectedLog.id}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Timestamp</Label>
                    <p>{format(new Date(selectedLog.createdAt), "yyyy-MM-dd HH:mm:ss")}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">User</Label>
                    <p>{selectedLog.userEmail} ({selectedLog.userRole})</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Action</Label>
                    <Badge className={actionColors[selectedLog.action]}>{actionLabels[selectedLog.action]}</Badge>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Entity</Label>
                    <p>{selectedLog.entityType} {selectedLog.entityId && `#${selectedLog.entityId}`}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">IP Address</Label>
                    <p className="font-mono text-sm">{selectedLog.ipAddress ?? "N/A"}</p>
                  </div>
                </div>

                {selectedLog.requestMethod && (
                  <div>
                    <Label className="text-muted-foreground">HTTP Request</Label>
                    <p className="font-mono text-sm">
                      {selectedLog.requestMethod} {selectedLog.requestPath}
                    </p>
                    {selectedLog.statusCode && (
                      <p className="text-sm">Status: {selectedLog.statusCode} | Duration: {selectedLog.durationMs}ms</p>
                    )}
                  </div>
                )}

                {selectedLog.userAgent && (
                  <div>
                    <Label className="text-muted-foreground">User Agent</Label>
                    <p className="text-xs font-mono break-all">{selectedLog.userAgent}</p>
                  </div>
                )}

                {(selectedLog.oldValues || selectedLog.newValues) && (
                  <div className="space-y-2">
                    <div>
                      <Label className="text-muted-foreground">Old Values</Label>
                      <pre className="bg-muted p-2 rounded text-xs overflow-x-auto max-h-40">
                        {selectedLog.oldValues ? JSON.stringify(selectedLog.oldValues, null, 2) : "N/A"}
                      </pre>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">New Values</Label>
                      <pre className="bg-muted p-2 rounded text-xs overflow-x-auto max-h-40">
                        {selectedLog.newValues ? JSON.stringify(selectedLog.newValues, null, 2) : "N/A"}
                      </pre>
                    </div>
                  </div>
                )}
              </div>
            ) : null}
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedLogId(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Prune Dialog */}
        <Dialog open={showPruneDialog} onOpenChange={setShowPruneDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Prune Old Activity Logs</DialogTitle>
              <DialogDescription>
                Delete activity logs older than the specified number of days. This action cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Retention Period (days)</Label>
                <Input
                  type="number"
                  min={30}
                  max={730}
                  value={retentionDays}
                  onChange={(e) => setRetentionDays(parseInt(e.target.value, 10) || 365)}
                />
                <p className="text-xs text-muted-foreground">
                  Recommended: 365 days (1 year). Minimum: 30 days.
                </p>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPruneDialog(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handlePrune} disabled={pruneMutation.isPending}>
                {pruneMutation.isPending ? "Pruning..." : "Prune Logs"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </Layout>
  );
}