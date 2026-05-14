import { useState } from "react";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { useOwners, useCreateOwner, useUpdateOwnerStatus } from "@/hooks/super-admin/useOwners";
import { superAdminApi } from "@/lib/api/superAdminApi";
import { OwnerTable } from "./OwnerTable";
import { OwnerFormDialog } from "./OwnerFormDialog";
import { OwnerDetailDrawer } from "./OwnerDetailDrawer";
import { ConfirmActionDialog } from "@/components/super-admin/ConfirmActionDialog";
import type { OwnerRow } from "@/lib/api/superAdminApi";

export default function OwnersPage() {
  const { toast } = useToast();
  const { data: owners = [], isLoading } = useOwners();
  const createOwner = useCreateOwner();
  const updateOwnerStatus = useUpdateOwnerStatus();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const [formOpen, setFormOpen] = useState(false);
  const [editingOwner, setEditingOwner] = useState<OwnerRow | null>(null);
  const [selectedOwner, setSelectedOwner] = useState<OwnerRow | null>(null);
  const [deletingOwner, setDeletingOwner] = useState<OwnerRow | null>(null);

  const filtered = owners.filter((o) => {
    const matchesSearch = o.name.toLowerCase().includes(search.toLowerCase()) ||
      o.email.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || o.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const handleSave = async (data: { name: string; email: string; phone?: string; plan: string }) => {
    try {
      if (editingOwner) {
        toast({ title: "Editing not implemented via PUT", description: "Use status change instead." });
      } else {
        await createOwner.mutateAsync(data);
        toast({ title: "Owner created successfully" });
      }
      setFormOpen(false);
      setEditingOwner(null);
    } catch {
      toast({ title: "Failed to save owner", variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deletingOwner) return;
    try {
      await superAdminApi.deleteOwner(deletingOwner.id);
      toast({ title: "Owner deleted (status set to CANCELLED)" });
      setDeletingOwner(null);
    } catch {
      toast({ title: "Failed to delete owner", variant: "destructive" });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Owner Management</h1>
          <p className="text-sm text-slate-500">Create, view, and manage all platform owners.</p>
        </div>
        <Button onClick={() => { setEditingOwner(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Add Owner
        </Button>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <Input
            placeholder="Search owners..."
            className="pl-9"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select
          className="rounded-lg border border-slate-200 px-3 py-2 text-sm bg-white"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="ON_TRIAL">On Trial</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        <OwnerTable
          owners={filtered}
          isLoading={isLoading}
          onEdit={(owner) => { setEditingOwner(owner); setFormOpen(true); }}
          onDelete={(owner) => setDeletingOwner(owner)}
          onView={(owner) => setSelectedOwner(owner)}
        />
      </div>

      <OwnerFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        owner={editingOwner}
        onSave={handleSave}
        isSaving={createOwner.isPending}
      />

      <OwnerDetailDrawer
        owner={selectedOwner}
        open={!!selectedOwner}
        onClose={() => setSelectedOwner(null)}
      />

      <ConfirmActionDialog
        open={!!deletingOwner}
        onOpenChange={(o) => { if (!o) setDeletingOwner(null); }}
        title="Delete Owner"
        description={`Are you sure you want to cancel ${deletingOwner?.name}? This will set their status to CANCELLED.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        variant="destructive"
      />
    </div>
  );
}
