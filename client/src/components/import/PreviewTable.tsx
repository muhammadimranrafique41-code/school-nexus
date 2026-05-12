interface PreviewTableProps {
  headers: string[];
  rows: Record<string, string>[];
}

export function PreviewTable({ headers, rows }: PreviewTableProps) {
  if (headers.length === 0) return null;

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-slate-200">
      <div className="max-h-64 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-100">
              <th className="sticky top-0 bg-slate-100 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">
                #
              </th>
              {headers.map((h) => (
                <th
                  key={h}
                  className="sticky top-0 bg-slate-100 px-3 py-2 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={headers.length + 1}
                  className="px-3 py-6 text-center text-[13px] text-slate-400"
                >
                  No rows to preview
                </td>
              </tr>
            ) : (
              rows.map((row, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50">
                  <td className="px-3 py-2 text-[11px] font-mono text-slate-400">{i + 2}</td>
                  {headers.map((h) => (
                    <td key={h} className="max-w-[160px] truncate px-3 py-2 text-[13px] text-slate-700">
                      {row[h] ?? ""}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="border-t border-slate-100 px-3 py-1.5 text-[10px] text-slate-400">
        Showing first {rows.length} row{rows.length !== 1 ? "s" : ""}
      </p>
    </div>
  );
}
