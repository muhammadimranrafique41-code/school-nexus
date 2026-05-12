import { useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Download, UploadCloud, Info } from "lucide-react";
import { FileDropZone } from "./FileDropZone";
import { PreviewTable } from "./PreviewTable";
import { ValidationErrorList } from "./ValidationErrorList";
import { ImportResultSummary } from "./ImportResultSummary";
import { parsePreview, type PreviewResult } from "@/lib/import/previewParser";
import { downloadSampleCsv } from "@/lib/import/sampleCsv";
import {
  useBulkImportFamilies,
  useBulkImportStudents,
  type ImportResponse,
} from "@/hooks/useBulkImport";

interface BulkImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: "families" | "students";
}

type ImportStep = "select" | "preview" | "uploading" | "result";

export function BulkImportModal({
  open,
  onOpenChange,
  defaultTab = "families",
}: BulkImportModalProps) {
  const [activeTab, setActiveTab] = useState<"families" | "students">(defaultTab);
  const [step, setStep] = useState<ImportStep>("select");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [result, setResult] = useState<ImportResponse | null>(null);

  const importFamilies = useBulkImportFamilies();
  const importStudents = useBulkImportStudents();

  const isUploading = step === "uploading";

  const handleFileSelected = useCallback(async (f: File) => {
    setFile(f);
    setResult(null);
    try {
      const p = await parsePreview(f);
      setPreview(p);
      setStep("preview");
    } catch {
      setStep("preview");
    }
  }, []);

  const handleClear = useCallback(() => {
    setFile(null);
    setPreview(null);
    setResult(null);
    setStep("select");
  }, []);

  const handleTabChange = useCallback(
    (tab: string) => {
      if (isUploading) return;
      setActiveTab(tab as "families" | "students");
      handleClear();
    },
    [isUploading, handleClear]
  );

  const handleUpload = useCallback(async () => {
    if (!file) return;
    setStep("uploading");
    try {
      const mutation =
        activeTab === "families" ? importFamilies : importStudents;
      const res = await mutation.mutateAsync(file);
      setResult(res);
      setStep("result");
    } catch (err) {
      setResult({
        success: false,
        imported: 0,
        skipped: 0,
        errors: [],
        message: err instanceof Error ? err.message : "Upload failed",
      });
      setStep("result");
    }
  }, [file, activeTab, importFamilies, importStudents]);

  const handleClose = useCallback(() => {
    if (isUploading) return;
    onOpenChange(false);
  }, [isUploading, onOpenChange]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open && isUploading) return;
      if (!open) {
        handleClear();
      }
      onOpenChange(open);
    },
    [isUploading, onOpenChange, handleClear]
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Bulk Import</DialogTitle>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="families" disabled={isUploading}>
              Upload Families
            </TabsTrigger>
            <TabsTrigger value="students" disabled={isUploading}>
              Upload Students
            </TabsTrigger>
          </TabsList>

          <TabsContent value="families" className="mt-4 space-y-4">
            {activeTab === "students" ? null : (
              <TabContent
                step={step}
                file={file}
                preview={preview}
                result={result}
                isUploading={isUploading}
                type="families"
                onFileSelected={handleFileSelected}
                onClear={handleClear}
                onUpload={handleUpload}
              />
            )}
          </TabsContent>

          <TabsContent value="students" className="mt-4 space-y-4">
            <div className="rounded-md border border-blue-800 bg-blue-950/20 p-3">
              <div className="flex items-start gap-2">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-400" />
                <p className="text-sm text-blue-200">
                  Families must be created before uploading students. Students
                  reference families by CNIC number.
                </p>
              </div>
            </div>
            {activeTab === "families" ? null : (
              <TabContent
                step={step}
                file={file}
                preview={preview}
                result={result}
                isUploading={isUploading}
                type="students"
                onFileSelected={handleFileSelected}
                onClear={handleClear}
                onUpload={handleUpload}
              />
            )}
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

interface TabContentProps {
  step: ImportStep;
  file: File | null;
  preview: PreviewResult | null;
  result: ImportResponse | null;
  isUploading: boolean;
  type: "families" | "students";
  onFileSelected: (f: File) => void;
  onClear: () => void;
  onUpload: () => void;
}

function TabContent({
  step,
  file,
  preview,
  result,
  isUploading,
  type,
  onFileSelected,
  onClear,
  onUpload,
}: TabContentProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Upload a CSV or Excel file containing {type} data.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-indigo-600"
          onClick={() => downloadSampleCsv(type)}
        >
          <Download className="mr-1 h-3 w-3" />
          Download Sample CSV
        </Button>
      </div>

      <FileDropZone onFileSelected={onFileSelected} file={file} onClear={onClear} />

      {preview && step !== "select" && (
        <PreviewTable headers={preview.headers} rows={preview.rows} />
      )}

      {result && step === "result" && <ImportResultSummary result={result} />}

      <div className="flex justify-end gap-2 pt-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onClear}
          disabled={isUploading}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          onClick={onUpload}
          disabled={!file || isUploading}
        >
          {isUploading ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              Uploading…
            </>
          ) : (
            <>
              <UploadCloud className="mr-1.5 h-3.5 w-3.5" />
              Upload
            </>
          )}
        </Button>
      </div>
    </>
  );
}
