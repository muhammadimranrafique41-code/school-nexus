import { useQuery } from "@tanstack/react-query";
import { Eye, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { OwnerStatusBadge } from "@/components/super-admin/OwnerStatusBadge";
import { superAdminApi, type OwnerRow } from "@/lib/api/superAdminApi";
import { useImpersonate } from "@/hooks/super-admin/useImpersonation";

interface OwnerDetailDrawerProps {
  owner: OwnerRow | null;
  open: boolean;
  onClose: () => void;
}

export function OwnerDetailDrawer({ owner, open, onClose }: OwnerDetailDrawerProps) {
  const impersonate = useImpersonate();

  const { data: campuses, isLoading: campusesLoading } = useQuery({
    queryKey: ["super-admin", "owner-campuses", owner?.id],
    queryFn: () => superAdminApi.getOwnerCampuses(owner!.id),
    enabled: !!owner && open,
  });

  if (!owner) return null;

  const handleImpersonate = () => {
    impersonate.mutate({ targetUserId: owner.id, targetRole: "owner" });
  };

  return (
    <div
      className={`fixed inset-y-0 right-0 z-50 w-full max-w-md bg-white border-l border-slate-200 shadow-xl transform transition-transform duration-300 ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-lg font-semibold text-slate-900">{owner.name}</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      <div className="overflow-y-auto h-full pb-20 p-4 space-y-6">
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Status</label>
          <div><OwnerStatusBadge status={owner.status} /></div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">Details</label>
          <div className="text-sm text-slate-700 space-y-1">
            <p><span className="font-medium">Email:</span> {owner.email}</p>
            <p><span className="font-medium">Phone:</span> {owner.phone ?? "N/A"}</p>
            <p><span className="font-medium">Plan:</span> {owner.plan}</p>
            <p><span className="font-medium">Pending Dues:</span> Rs. {(owner.pendingDuesPaise / 100).toLocaleString()}</p>
            <p><span className="font-medium">Students:</span> {owner.studentCount.toLocaleString()}</p>
            <p><span className="font-medium">Last Billing:</span> {owner.lastBillingDate ? new Date(owner.lastBillingDate).toLocaleDateString("en-PK") : "Never"}</p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            Campuses ({campuses?.length ?? 0})
          </label>
          {campusesLoading ? (
            <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
          ) : (
            <div className="space-y-2">
              {campuses?.map((c) => (
                <div key={c.id} className="rounded-lg border border-slate-200 p-3 text-sm">
                  <p className="font-medium text-slate-900">{c.name}</p>
                  <p className="text-slate-500 text-xs mt-0.5">{c.subdomain} &middot; {c.address}</p>
                </div>
              ))}
              {(!campuses || campuses.length === 0) && (
                <p className="text-sm text-slate-400">No campuses found.</p>
              )}
            </div>
          )}
        </div>

        <div className="pt-2">
          <Button
            variant="outline"
            className="w-full gap-2"
            onClick={handleImpersonate}
            disabled={impersonate.isPending}
          >
            <Eye className="h-4 w-4" />
            {impersonate.isPending ? "Impersonating..." : "Impersonate as Owner"}
          </Button>
        </div>
      </div>
    </div>
  );
}
