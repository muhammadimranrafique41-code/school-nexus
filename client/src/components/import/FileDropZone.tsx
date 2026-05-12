import { useCallback, useRef, useState } from "react";
import { UploadCloud, FileText, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface FileDropZoneProps {
  onFileSelected: (file: File) => void;
  file: File | null;
  onClear: () => void;
}

export function FileDropZone({ onFileSelected, file, onClear }: FileDropZoneProps) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) validateAndSet(f);
    },
    [onFileSelected]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (f) validateAndSet(f);
    },
    [onFileSelected]
  );

  function validateAndSet(f: File) {
    const allowed = [
      "text/csv",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ];
    if (!allowed.includes(f.type) && !f.name.endsWith(".csv") && !f.name.endsWith(".xlsx")) {
      return;
    }
    onFileSelected(f);
  }

  if (file) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-indigo-200 bg-indigo-50/50 px-4 py-3">
        <FileText className="h-5 w-5 shrink-0 text-indigo-500" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{file.name}</p>
          <p className="text-[11px] text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-200 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    );
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        "flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 transition-colors",
        dragging
          ? "border-indigo-400 bg-indigo-50/50"
          : "border-slate-300 bg-slate-50 hover:border-slate-400 hover:bg-slate-100"
      )}
    >
      <UploadCloud className="h-8 w-8 text-slate-400" />
      <div className="text-center">
        <p className="text-sm font-medium text-slate-700">
          Drop your file here, or <span className="text-indigo-600 underline underline-offset-2">browse</span>
        </p>
        <p className="mt-0.5 text-[11px] text-slate-400">Supports CSV and Excel (.xlsx) files up to 5 MB</p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept=".csv,.xlsx"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}
