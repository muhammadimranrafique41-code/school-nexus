/**
 * FamilyVoucherPage.tsx
 *
 * Standalone page for a single family's fee voucher.
 * Route: /admin/finance/vouchers/family/:familyId?months=2025-01,2025-02
 *
 * Features:
 *  • Loads family voucher data via useFamilyVoucher()
 *  • Renders premium FamilyVoucherPdf component (Student Copy + School Copy)
 *  • "Print / Save PDF" button — opens browser print dialog
 *  • "Download PDF" button — fetches server-rendered PDF and triggers download
 *  • Back navigation to preview page
 */

import { useRef, useState } from "react";
import { useParams, useSearch, useLocation } from "wouter";
import {
  ArrowLeft,
  Download,
  Loader2,
  Printer,
  AlertCircle,
  FileText,
  Users,
  Calendar,
  CreditCard,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { FamilyVoucherPdf } from "@/components/finance/FamilyVoucherPdf";
import { useFamilyVoucher } from "@/hooks/use-consolidated-vouchers";
import { usePublicSchoolSettings } from "@/hooks/use-settings";
import { useToast } from "@/hooks/use-toast";
import { formatCurrency } from "@shared/finance";

// ─── helpers ─────────────────────────────────────────────────────────────────

function printElement(el: HTMLElement | null) {
  if (!el) return;
  const win = window.open("", "_blank", "width=794,height=1123");
  if (!win) return;

  // Collect all inline <style> tags from the source document so that
  // the print window gets the same CSS (including @media print rules).
  const styleBlocks = Array.from(document.querySelectorAll("style"))
    .map((s) => s.outerHTML)
    .join("\n");

  win.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Family Fee Voucher</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; background: #fff; }
    @page { size: A4 portrait; margin: 0; }
    @media print {
      html, body { width: 210mm; height: 297mm; overflow: hidden; }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
  </style>
  ${styleBlocks}
</head>
<body>${el.innerHTML}</body>
</html>`);
  win.document.close();
  win.focus();
  // Use a short timeout to ensure the document is fully parsed before printing
  setTimeout(() => {
    win.print();
    win.close();
  }, 300);
}

async function downloadPdf(familyId: string, billingMonths: string[], familyName: string) {
  const params = new URLSearchParams();
  billingMonths.forEach((m) => params.append("billingMonths", m));
  const url = `/api/fees/vouchers/family/${familyId}/pdf?${params}`;

  const res = await fetch(url, { credentials: "include" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as any).message ?? "Failed to download PDF");
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = objectUrl;
  a.download = `family-voucher-${familyName.replace(/[^A-Za-z0-9]+/g, "-").toLowerCase()}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(objectUrl);
}

// ─── stat card ────────────────────────────────────────────────────────────────

function StatCard({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <Card className="border-slate-200/80 shadow-none">
      <CardContent className="flex items-center gap-3 p-4">
        <div
          className="flex h-9 w-9 items-center justify-center rounded-lg"
          style={{ background: accent ? `${accent}18` : "#f5f3ff" }}
        >
          <Icon className="h-4 w-4" style={{ color: accent ?? "#5b21b6" }} />
        </div>
        <div>
          <p className="text-xs text-slate-500">{label}</p>
          <p className="text-sm font-semibold text-slate-900">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function FamilyVoucherPage() {
  const { familyId } = useParams<{ familyId: string }>();
  const search = useSearch();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const printRef = useRef<HTMLDivElement>(null);
  const [downloading, setDownloading] = useState(false);

  const params = new URLSearchParams(search);
  const billingMonths = (params.get("months") ?? "").split(",").filter(Boolean);

  const query = useFamilyVoucher(familyId ? Number(familyId) : null, billingMonths);
  const settingsQuery = usePublicSchoolSettings();

  const schoolName =
    settingsQuery.data?.schoolInformation?.schoolName ?? "School Management System";
  const schoolAddress =
    settingsQuery.data?.schoolInformation?.schoolAddress || undefined;

  // Redirect if no months provided
  if (billingMonths.length === 0) {
    navigate("/admin/finance/vouchers/generate");
    return null;
  }

  async function handleDownload() {
    if (!query.data || !familyId) return;
    setDownloading(true);
    try {
      await downloadPdf(familyId, billingMonths, query.data.family.name);
      toast({ title: "PDF downloaded", description: `${query.data.family.name} voucher saved.` });
    } catch (err) {
      toast({
        title: "Download failed",
        description: (err as Error).message,
        variant: "destructive",
      });
    } finally {
      setDownloading(false);
    }
  }

  const backUrl = `/admin/finance/vouchers/preview?months=${billingMonths.join(",")}`;

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="mt-0.5 h-8 w-8 shrink-0"
            onClick={() => navigate(backUrl)}
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900">
                {query.data?.family.name ?? "Family Voucher"}
              </h1>
              {query.data && (
                <Badge className="bg-violet-100 text-violet-700 border-violet-200">
                  {query.data.family.siblingCount} student
                  {query.data.family.siblingCount !== 1 ? "s" : ""}
                </Badge>
              )}
            </div>
            <p className="mt-0.5 text-sm text-slate-500">
              Billing months:{" "}
              <span className="font-medium text-slate-700">{billingMonths.join(", ")}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => printElement(printRef.current)}
            disabled={!query.data}
          >
            <Printer className="mr-1.5 h-4 w-4" />
            Print / Save PDF
          </Button>
          <Button
            size="sm"
            onClick={handleDownload}
            disabled={!query.data || downloading}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            {downloading ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-4 w-4" />
            )}
            Download PDF
          </Button>
        </div>
      </div>

      {/* ── Loading state ─────────────────────────────────────────────────── */}
      {query.isLoading && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
          <Skeleton className="h-[600px] w-full rounded-lg" />
        </div>
      )}

      {/* ── Error state ───────────────────────────────────────────────────── */}
      {query.isError && (
        <div className="flex items-center gap-3 rounded-lg border border-red-200 bg-red-50 p-4 text-red-600">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div>
            <p className="font-medium">Failed to load voucher</p>
            <p className="text-sm">{(query.error as Error).message}</p>
          </div>
        </div>
      )}

      {/* ── Data loaded ───────────────────────────────────────────────────── */}
      {query.data && (
        <>
          {/* Stats row */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={Users}
              label="Students"
              value={String(query.data.family.siblingCount)}
              accent="#5b21b6"
            />
            <StatCard
              icon={Calendar}
              label="Due Date"
              value={new Date(query.data.dueDate).toLocaleDateString("en-PK", {
                day: "2-digit",
                month: "short",
                year: "numeric",
              })}
              accent="#0891b2"
            />
            <StatCard
              icon={FileText}
              label="Previous Dues"
              value={formatCurrency(query.data.summary.previousDuesTotal)}
              accent="#dc2626"
            />
            <StatCard
              icon={CreditCard}
              label="Net Payable"
              value={formatCurrency(query.data.summary.netPayable)}
              accent="#16a34a"
            />
          </div>

          <Separator />

          {/* Voucher preview label */}
          <div className="flex items-center gap-2">
            <div className="h-1 w-6 rounded-full bg-violet-500" />
            <p className="text-sm font-medium text-slate-600">Voucher Preview</p>
            <div className="h-1 flex-1 rounded-full bg-slate-100" />
            <p className="text-xs text-slate-400">
              Voucher No: {query.data.voucherNumber}
            </p>
          </div>

          {/* Voucher render (hidden from screen, used for print) */}
          <div
            ref={printRef}
            className="overflow-hidden rounded-xl border border-slate-200 shadow-sm"
          >
            <FamilyVoucherPdf
              data={query.data}
              schoolName={schoolName}
              schoolAddress={schoolAddress}
            />
          </div>

          {/* Bottom action bar */}
          <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
            <p className="text-xs text-slate-500">
              Generated: {new Date(query.data.generatedAt).toLocaleString("en-PK")}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => printElement(printRef.current)}
              >
                <Printer className="mr-1.5 h-3.5 w-3.5" />
                Print
              </Button>
              <Button
                size="sm"
                onClick={handleDownload}
                disabled={downloading}
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                {downloading ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                )}
                Download PDF
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
