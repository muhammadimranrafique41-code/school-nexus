import { Layout } from "@/components/layout";
import { FamilyCard } from "@/components/family/FamilyCard";
import { useFamilies } from "@/hooks/use-families";

export default function AdminFamiliesPage() {
  const { data, isLoading, error } = useFamilies();

  return (
    <Layout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Family Tree</h1>
          <p className="mt-1 text-sm text-slate-500">
            Review sibling groupings, family-level dues, and linked student records from one admin view.
          </p>
        </div>

        {isLoading ? <div className="text-sm text-slate-500">Loading families...</div> : null}
        {error ? <div className="text-sm text-red-600">{(error as Error).message}</div> : null}

        <div className="grid gap-4 xl:grid-cols-2">
          {(data ?? []).map((family: any) => (
            <FamilyCard key={family.id} family={family} />
          ))}
        </div>
      </div>
    </Layout>
  );
}
