import { useMemo, useState } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination"
import { Skeleton } from "@/components/ui/skeleton"
import { Search, X, Banknote } from "lucide-react"
import { formatCurrency } from "@/lib/utils"

interface FeeRecord {
  id: number
  studentName: string
  className?: string
  invoiceNumber: string
  amount: number
  paidAmount: number
  remainingBalance: number
  status: string
  dueDate: string
  billingPeriod: string
}

interface FeeTableProps {
  records?: FeeRecord[]
  isLoading?: boolean
  pageSize?: number
}

const statusBadgeClass: Record<string, string> = {
  Paid: "bg-emerald-100 text-emerald-700 border-emerald-200",
  Partial: "bg-amber-100 text-amber-700 border-amber-200",
  Unpaid: "bg-rose-100 text-rose-700 border-rose-200",
  Overdue: "bg-red-100 text-red-700 border-red-200",
}

export function FeeTable({ records = [], isLoading, pageSize = 10 }: FeeTableProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [currentPage, setCurrentPage] = useState(1)

  const filtered = useMemo(() => {
    let result = records
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      result = result.filter(
        (r) =>
          r.studentName.toLowerCase().includes(term) ||
          r.invoiceNumber.toLowerCase().includes(term) ||
          (r.className && r.className.toLowerCase().includes(term)),
      )
    }
    if (statusFilter !== "all") {
      result = result.filter((r) => r.status === statusFilter)
    }
    return result
  }, [records, searchTerm, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const safePage = Math.min(Math.max(currentPage, 1), totalPages)
  const pageItems = filtered.slice((safePage - 1) * pageSize, safePage * pageSize)

  if (isLoading) {
    return (
      <Card className="border-slate-200/80 bg-white shadow-none">
        <CardHeader className="px-4 py-3">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-1 h-4 w-48" />
        </CardHeader>
        <CardContent className="p-4">
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full rounded-lg" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="border-slate-200/80 bg-white shadow-none">
      <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-slate-100 px-4 py-3">
        <div>
          <CardTitle className="text-sm font-semibold text-slate-900">Fee Records</CardTitle>
          <CardDescription className="text-[11px]">
            {filtered.length} record{filtered.length !== 1 ? "s" : ""}
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <Input
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1) }}
              placeholder="Search..."
              className="h-8 w-40 pl-8 text-xs"
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm("")} className="absolute right-2 top-1/2 -translate-y-1/2">
                <X className="h-3 w-3 text-slate-400" />
              </button>
            )}
          </div>
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1) }}>
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All</SelectItem>
              <SelectItem value="Paid" className="text-xs">Paid</SelectItem>
              <SelectItem value="Partial" className="text-xs">Partial</SelectItem>
              <SelectItem value="Unpaid" className="text-xs">Unpaid</SelectItem>
              <SelectItem value="Overdue" className="text-xs">Overdue</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              {["Student", "Invoice", "Period", "Amount", "Paid", "Balance", "Status"].map((h) => (
                <th key={h} className="whitespace-nowrap px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 first:pl-4 last:pr-4">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {pageItems.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-12 text-center text-sm text-slate-400">
                  <div className="flex flex-col items-center gap-2">
                    <Banknote className="h-8 w-8 text-slate-300" />
                    No fee records found.
                  </div>
                </td>
              </tr>
            ) : (
              pageItems.map((record) => (
                <tr key={record.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="px-3 py-3 first:pl-4">
                    <p className="text-[13px] font-semibold text-slate-900">{record.studentName}</p>
                    {record.className && (
                      <p className="text-[11px] text-slate-400">{record.className}</p>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-[12px] font-mono font-medium text-slate-700">{record.invoiceNumber}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-[12px] text-slate-600">{record.billingPeriod}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-[13px] font-semibold text-slate-900">{formatCurrency(record.amount)}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-[13px] font-semibold text-emerald-600">{formatCurrency(record.paidAmount)}</p>
                  </td>
                  <td className="px-3 py-3">
                    <p className={`text-[13px] font-semibold ${record.remainingBalance > 0 ? "text-rose-600" : "text-slate-400"}`}>
                      {formatCurrency(record.remainingBalance)}
                    </p>
                  </td>
                  <td className="px-3 py-3 last:pr-4">
                    <Badge variant="outline" className={statusBadgeClass[record.status] ?? "bg-slate-100 text-slate-600"}>
                      {record.status}
                    </Badge>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > pageSize && (
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
          <p className="text-[11px] text-slate-400">
            {(safePage - 1) * pageSize + 1}–{Math.min(safePage * pageSize, filtered.length)} of {filtered.length}
          </p>
          <Pagination className="mx-0 w-auto justify-end">
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  className={`h-7 text-xs ${safePage === 1 ? "pointer-events-none opacity-40" : ""}`}
                  onClick={(e) => { e.preventDefault(); setCurrentPage((p) => Math.max(1, p - 1)) }}
                />
              </PaginationItem>
              <PaginationItem>
                <span className="px-3 text-[11px] text-slate-400">Page {safePage} / {totalPages}</span>
              </PaginationItem>
              <PaginationItem>
                <PaginationNext
                  href="#"
                  className={`h-7 text-xs ${safePage === totalPages ? "pointer-events-none opacity-40" : ""}`}
                  onClick={(e) => { e.preventDefault(); setCurrentPage((p) => Math.min(totalPages, p + 1)) }}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </Card>
  )
}
