import { useState } from "react";
import { Plus, Users } from "lucide-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { FamilyCard } from "@/components/family/FamilyCard";
import { CreateFamilyDialog } from "@/components/family/CreateFamilyDialog";
import { useFamilies } from "@/hooks/use-families";

export default function AdminFamiliesPage() {
  const { data, isLoading, error } = useFamilies();
  const [createOpen, setCreateOpen] = useState(false);

  const families = (data ?? []) as any[];

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Family Tree</h1>
            <p className="mt-1 text-sm text-slate-500">
              Review sibling groupings, family-level dues, and linked student records from one admin view.
            </p>
          </div>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />Create family
          </Button>
        </div>

        {isLoading ? <div className="text-sm text-slate-500">Loading families...</div> : null}
        {error ? <div className="text-sm text-red-600">{(error as Error).message}</div> : null}

        {!isLoading && families.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-6 py-12 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 text-indigo-600">
              <Users className="h-5 w-5" />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-700">No families yet</p>
            <p className="mt-1 text-xs text-slate-500">
              Create a family to group siblings and consolidate guardian contact details.
            </p>
            <Button size="sm" className="mt-4" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />Create your first family
            </Button>
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-2">
          {families.map((family: any) => (
            <FamilyCard key={family.id} family={family} />
          ))}
        </div>

        <CreateFamilyDialog open={createOpen} onOpenChange={setCreateOpen} />
      </div>
    </Layout>
  );
}
