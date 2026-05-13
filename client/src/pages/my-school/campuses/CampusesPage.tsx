import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Building2, Plus } from "lucide-react";
import {
  useCampuses,
  useCreateCampus,
  useUpdateCampus,
  useDeleteCampus,
  type CampusRow,
} from "@/hooks/my-school/useCampuses";
import { CampusTable } from "./CampusTable";
import { CampusFormDialog } from "./CampusFormDialog";
import { CampusFilters } from "./CampusFilters";

export default function CampusesPage() {
  const [, navigate] = useLocation();
  const { data: campuses, isLoading } = useCampuses();
  const createCampus = useCreateCampus();
  const updateCampus = useUpdateCampus();
  const deleteCampus = useDeleteCampus();

  const [selectedCampusId, setSelectedCampusId] = useState<number | null>(null);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCampus, setEditingCampus] = useState<CampusRow | undefined>();

  const campusOptions = (campuses ?? []).map((c) => ({
    id: c.id,
    name: c.name,
  }));

  const handleCreate = (data: {
    name: string;
    subdomain: string;
    address: string;
    contactInfo: { phone: string; email: string };
  }) => {
    createCampus.mutate(data, {
      onSuccess: () => {
        setDialogOpen(false);
      },
    });
  };

  const handleEdit = (campus: CampusRow) => {
    setEditingCampus(campus);
    setDialogOpen(true);
  };

  const handleUpdate = (data: {
    name: string;
    subdomain: string;
    address: string;
    contactInfo: { phone: string; email: string };
    isActive?: boolean;
  }) => {
    if (!editingCampus) return;
    updateCampus.mutate(
      { id: editingCampus.id, ...data },
      {
        onSuccess: () => {
          setDialogOpen(false);
          setEditingCampus(undefined);
        },
      }
    );
  };

  const handleDelete = (id: number) => {
    deleteCampus.mutate(id);
  };

  const handleManage = (id: number) => {
    navigate(`/admin/campuses/${id}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900">
            Campuses
          </h1>
          <p className="text-sm text-slate-500">
            Manage your school campuses and branches.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditingCampus(undefined);
            setDialogOpen(true);
          }}
          className="bg-indigo-600 hover:bg-indigo-500"
        >
          <Plus className="mr-1.5 h-4 w-4" />
          Add Campus
        </Button>
      </div>

      <CampusFilters
        campusOptions={campusOptions}
        selectedCampusId={selectedCampusId}
        onCampusChange={setSelectedCampusId}
        startDate={startDate}
        endDate={endDate}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
      />

      <CampusTable
        campuses={campuses}
        isLoading={isLoading}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onManage={handleManage}
        filterCampusId={selectedCampusId}
      />

      <CampusFormDialog
        open={dialogOpen}
        onClose={() => {
          setDialogOpen(false);
          setEditingCampus(undefined);
        }}
        onSubmit={editingCampus ? handleUpdate : handleCreate}
        initialData={
          editingCampus
            ? {
                id: editingCampus.id,
                name: editingCampus.name,
                subdomain: editingCampus.subdomain,
                address: editingCampus.address,
                contactInfo: editingCampus.contactInfo,
                isActive: editingCampus.isActive,
              }
            : undefined
        }
        isSubmitting={createCampus.isPending || updateCampus.isPending}
      />
    </div>
  );
}
