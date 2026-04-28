import { useLocation, useSearch } from "wouter";
import { useRef, useState } from "react";
import { AlertCircle, ArrowLeft, Loader2, Printer, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { BreakdownPanel } from "@/components/finance/BreakdownPanel";
import { ConsolidatedVoucher } from "@/components/finance/ConsolidatedVoucher";
import {
  useFamilyPreview,
  useFamilyVoucher,
  useGenerateFamilyVouchers,
  type FamilyPreviewItem,
} from "@/hooks/use-consolidated-vouchers";
import { usePublicSchoolSettings } from "@/hooks/use-settings";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@shared/finance";

function printElement(el: HTMLElement | null) {
  if (!el) return;
  const win = window.open("", "_blank", "width=900,height=1100");
  if (!win) return;
  win.document.write(`<!doctype html><html><head><title>Family Voucher</title></head><body>${el.innerHTML}</body></html>`);
  win.document.close();
  win.focus();
  win.onload = () => {
    win.print();
    win.close();
  };
}

function VoucherPrintDialog({
  family,
  billingMonths,
  schoolName,
  schoolAddress,
  onClose,
}: {
  family: FamilyPreviewItem;
  billingMonths: string[];
  schoolName: string;
  schoolAddress?: string;
  onClose: () => void;
}) {
  const printRef = useRef<HTMLDivElement>(null);
  const query = useFamilyVoucher(family.familyId, billingMonths);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="h-4 w-4" />
            {family.familyName}
          </DialogTitle>
        </DialogHeader>

        {query.isLoading ? (
          <div className="flex items-center justify-center gap-3 py-12 text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading family voucher...</span>
          </div>
        ) : null}

        {query.isError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">
            {(query.error as Error).message}
          </div>
        ) : null}

        {query.data ? (
          <>
            <div className="flex justify-end border-b pb-2">
              <Button size="sm" variant="outline" onClick={() => printElement(printRef.current)}>
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                Print / Save PDF
              </Button>
            </div>
            <div ref={printRef}>
              <ConsolidatedVoucher
                data={query.data}
                schoolName={schoolName}
                schoolAddress={schoolAddress}
              />
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default function StudentPreviewPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const billingMonths = (params.get("months") ?? "").split(",").filter(Boolean);
  const { toast } = useToast();

  const [selectedFamily, setSelectedFamily] = useState<FamilyPreviewItem | null>(null);

  const { query, filters, setFilters, filteredFamilies, expandedRows, toggleExpand } =
    useFamilyPreview(billingMonths, billingMonths.length > 0);
  const generate = useGenerateFamilyVouchers();
  const settingsQuery = usePublicSchoolSettings();

  const schoolName =
    settingsQuery.data?.schoolInformation?.schoolName ?? "School Management System";
  const schoolAddress = settingsQuery.data?.schoolInformation?.schoolAddress || undefined;

  if (billingMonths.length === 0) {
    navigate("/admin/finance/vouchers/generate");
    return null;
  }

  async function handleGenerate() {
    try {
      const result = await generate.mutateAsync({
        billingMonths,
        familyIds: filteredFamilies.map((family) => family.familyId),
        includeOverdue: true,
      });
      toast({
        title: "Family vouchers generated",
        description: `${result.generatedCount} family invoice${result.generatedCount === 1 ? "" : "s"} created.`,
      });
    } catch (error) {
      toast({
        title: "Failed",
        description: (error as Error).message,
        variant: "destructive",
      });
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Family Preview</h1>
          <p className="mt-1 text-sm text-slate-500">
            Review sibling groups, print one family challan, and generate invoices in one pass.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/admin/finance/vouchers/generate")}>
            <ArrowLeft className="mr-1.5 h-4 w-4" />
            Back
          </Button>
          <Button
            size="sm"
            onClick={handleGenerate}
            disabled={generate.isPending || filteredFamilies.length === 0}
          >
            {generate.isPending ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : null}
            Generate Family Vouchers
          </Button>
        </div>
      </div>

      {query.data ? (
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Families</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{query.data.summary.totalFamilies}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Students</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">{query.data.summary.totalStudents}</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs uppercase tracking-wide text-slate-400">Outstanding</p>
            <p className="mt-1 text-2xl font-bold text-slate-900">
              {formatCurrency(query.data.summary.totalOutstanding)}
            </p>
          </div>
        </div>
      ) : null}

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <Input
          className="pl-9"
          placeholder="Search family or sibling..."
          value={filters.search}
          onChange={(event) =>
            setFilters((current) => ({ ...current, search: event.target.value }))
          }
        />
      </div>

      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton key={index} className="h-20 w-full" />
          ))}
        </div>
      ) : null}

      {query.isError ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-red-600">
          <AlertCircle className="h-5 w-5" />
          <span className="text-sm">{(query.error as Error).message}</span>
        </div>
      ) : null}

      {!query.isLoading && !query.isError ? (
        <div className="space-y-3">
          {filteredFamilies.map((family) => {
            const isExpanded = expandedRows.has(family.familyId);
            return (
              <div key={family.familyId} className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                <button
                  className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
                  onClick={() => toggleExpand(family.familyId)}
                >
                  <div>
                    <p className="text-base font-semibold text-slate-900">{family.familyName}</p>
                    <p className="mt-1 text-sm text-slate-500">
                      {family.siblingCount} sibling{family.siblingCount === 1 ? "" : "s"}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs uppercase tracking-wide text-slate-400">Outstanding</p>
                      <p className="text-lg font-bold text-slate-900">
                        {formatCurrency(family.totalOutstanding)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelectedFamily(family);
                      }}
                    >
                      <Printer className="mr-1.5 h-3.5 w-3.5" />
                      Preview
                    </Button>
                  </div>
                </button>
                {isExpanded ? <BreakdownPanel family={family} /> : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {selectedFamily ? (
        <VoucherPrintDialog
          family={selectedFamily}
          billingMonths={billingMonths}
          schoolName={schoolName}
          schoolAddress={schoolAddress}
          onClose={() => setSelectedFamily(null)}
        />
      ) : null}
    </div>
  );
}
