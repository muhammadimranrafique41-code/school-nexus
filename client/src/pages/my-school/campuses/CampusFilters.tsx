interface Props {
  campusOptions: { id: number; name: string }[];
  selectedCampusId: number | null;
  onCampusChange: (id: number | null) => void;
  startDate: string;
  endDate: string;
  onStartDateChange: (date: string) => void;
  onEndDateChange: (date: string) => void;
}

export function CampusFilters({
  campusOptions,
  selectedCampusId,
  onCampusChange,
  startDate,
  endDate,
  onStartDateChange,
  onEndDateChange,
}: Props) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <select
        value={selectedCampusId ?? ""}
        onChange={(e) =>
          onCampusChange(
            e.target.value ? Number(e.target.value) : null
          )
        }
        className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
      >
        <option value="">All Campuses</option>
        {campusOptions.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
      <input
        type="date"
        value={startDate}
        onChange={(e) => onStartDateChange(e.target.value)}
        placeholder="Start Date"
        className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
      />
      <input
        type="date"
        value={endDate}
        onChange={(e) => onEndDateChange(e.target.value)}
        placeholder="End Date"
        className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700"
      />
    </div>
  );
}
