import { useMemo, useState } from "react";
import { Link } from "wouter";
import {
  ChevronRight,
  Edit2,
  Eye,
  Loader2,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  Users,
  Wallet,
  AlertCircle,
  Phone,
  Mail,
  IdCard,
  Briefcase,
  MapPin,
} from "lucide-react";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import { CreateFamilyDialog, type FamilyInitialData } from "@/components/family/CreateFamilyDialog";
import { useFamilies, useDeleteFamily } from "@/hooks/use-families";
import { useToast } from "@/hooks/use-toast";
import { cn, getErrorMessage, paginateItems } from "@/lib/utils";
import { formatCurrency } from "@shared/finance";
import type { FamilyGuardianDetails } from "@shared/schema";

type FamilyMember = {
  id: number;
  name: string;
  email: string;
  role: string;
  className?: string | null;
  studentStatus?: string | null;
  studentPhotoUrl?: string | null;
  outstandingBalance: number;
  openInvoices: number;
};

type FamilyRow = {
  id: number;
  name: string;
  guardianDetails: FamilyGuardianDetails | null | undefined;
  walletBalance: number;
  totalOutstanding: number;
  siblingCount: number;
  siblings: FamilyMember[];
};

const PAGE_SIZE = 10;

function FamilyAvatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-[11px] font-bold text-indigo-700">
      {initials || "FA"}
    </div>
  );
}

function RoleBadge({ role }: { role: string }) {
  const map: Record<string, string> = {
    student: "border-indigo-200 bg-indigo-50 text-indigo-700",
    parent: "border-amber-200 bg-amber-50 text-amber-700",
    teacher: "border-emerald-200 bg-emerald-50 text-emerald-700",
    admin: "border-violet-200 bg-violet-50 text-violet-700",
  };
  return (
    <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", map[role] ?? map.student)}>
      {role}
    </span>
  );
}

export default function AdminFamiliesPage() {
  const { data, isLoading, error } = useFamilies();
  const deleteFamily = useDeleteFamily();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [editingFamily, setEditingFamily] = useState<FamilyInitialData | null>(null);
  const [viewingFamily, setViewingFamily] = useState<FamilyRow | null>(null);
  const [familyToDelete, setFamilyToDelete] = useState<FamilyRow | null>(null);

  const families = useMemo<FamilyRow[]>(() => (data ?? []) as FamilyRow[], [data]);

  const filtered = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return families;
    return families.filter((family) => {
      const guardian = family.guardianDetails?.primary ?? null;
      const haystack = [
        family.name,
        guardian?.name,
        guardian?.phone,
        guardian?.email,
        guardian?.cnic,
        ...family.siblings.map((s) => s.name),
        ...family.siblings.map((s) => s.email),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [families, searchTerm]);

  const paginated = paginateItems(filtered, currentPage, PAGE_SIZE);

  const summary = useMemo(() => {
    const totalMembers = families.reduce((sum, family) => sum + family.siblingCount, 0);
    const totalOutstanding = families.reduce((sum, family) => sum + family.totalOutstanding, 0);
    const totalWallet = families.reduce((sum, family) => sum + family.walletBalance, 0);
    return { totalFamilies: families.length, totalMembers, totalOutstanding, totalWallet };
  }, [families]);

  const handleEdit = (family: FamilyRow) => {
    setEditingFamily({
      id: family.id,
      name: family.name,
      guardianDetails: family.guardianDetails ?? null,
    });
    setCreateOpen(true);
  };

  const handleDelete = async () => {
    if (!familyToDelete) return;
    try {
      await deleteFamily.mutateAsync(familyToDelete.id);
      toast({
        title: "Family deleted",
        description: `${familyToDelete.name} has been removed. Linked members were unlinked.`,
      });
      setFamilyToDelete(null);
    } catch (err) {
      toast({
        title: "Failed to delete family",
        description: getErrorMessage(err),
        variant: "destructive",
      });
    }
  };

  const handleDialogClose = (open: boolean) => {
    setCreateOpen(open);
    if (!open) setEditingFamily(null);
  };

  return (
    <Layout>
      <div className="space-y-5 pb-8">
        <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-blue-500 text-white shadow-md shadow-indigo-200">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900">Family Directory</h1>
              <p className="mt-0.5 text-[12px] text-slate-400">Manage family units, guardian contacts, and sibling linkages.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => { setEditingFamily(null); setCreateOpen(true); }}>
              <Plus className="mr-1.5 h-3.5 w-3.5" />Add Family
            </Button>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {[
            { label: "Total families", value: summary.totalFamilies, icon: Users, color: "text-indigo-600 bg-indigo-50", border: "border-indigo-100" },
            { label: "Linked members", value: summary.totalMembers, icon: Users, color: "text-emerald-600 bg-emerald-50", border: "border-emerald-100" },
            { label: "Outstanding", value: formatCurrency(summary.totalOutstanding), icon: AlertCircle, color: "text-rose-600 bg-rose-50", border: "border-rose-100" },
            { label: "Wallet balance", value: formatCurrency(summary.totalWallet), icon: Wallet, color: "text-violet-600 bg-violet-50", border: "border-violet-100" },
          ].map((item) => (
            <Card key={item.label} className={cn("border bg-white shadow-none", item.border)}>
              <CardContent className="flex items-center gap-3 p-4">
                <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", item.color)}>
                  <item.icon className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{item.label}</p>
                  <p className="mt-0.5 text-2xl font-bold leading-tight text-slate-900">{item.value}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <Card className="overflow-hidden border-slate-200/80 bg-white shadow-none">
          <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search by family, guardian, member…"
                className="h-8 pl-8 text-sm"
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
              />
            </div>
            <p className="text-[11px] text-slate-400">
              {filtered.length} of {families.length} families
            </p>
          </div>

          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-[800px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Family</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Primary Guardian</th>
                  <th className="px-3 py-2.5 text-left text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Members</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Outstanding</th>
                  <th className="px-3 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Wallet</th>
                  <th className="px-4 py-2.5 text-right text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={6} className="py-14 text-center"><Loader2 className="mx-auto h-5 w-5 animate-spin text-indigo-500" /></td></tr>
                ) : error ? (
                  <tr><td colSpan={6} className="py-14 text-center text-[13px] text-rose-600">{(error as Error).message}</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="py-14 text-center text-[13px] text-slate-400">
                    {families.length === 0 ? "No families yet. Create one to group siblings." : "No families match your search."}
                  </td></tr>
                ) : (
                  paginated.pageItems.map((family, idx) => {
                    const guardian = family.guardianDetails?.primary ?? null;
                    return (
                      <tr key={family.id} className={cn("group border-b border-slate-100 last:border-b-0 transition-colors duration-100 hover:bg-slate-50/60", idx % 2 === 1 && "bg-slate-50/30")}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <FamilyAvatar name={family.name} />
                            <div>
                              <span className="block text-[13px] font-semibold text-slate-900">{family.name}</span>
                              <span className="block text-[11px] text-slate-400">ID #{family.id}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-2.5">
                          {guardian?.name ? (
                            <>
                              <span className="block text-[13px] font-medium text-slate-700">{guardian.name}</span>
                              <span className="block text-[11px] text-slate-400">
                                {guardian.relation || "Guardian"}{guardian.phone ? ` · ${guardian.phone}` : ""}
                              </span>
                            </>
                          ) : (
                            <span className="text-[12px] italic text-slate-400">Not provided</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5">
                          <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                            {family.siblingCount} member{family.siblingCount === 1 ? "" : "s"}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className={cn("text-[13px] font-bold", family.totalOutstanding > 0 ? "text-rose-600" : "text-slate-500")}>
                            {formatCurrency(family.totalOutstanding)}
                          </span>
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          <span className="text-[13px] font-semibold text-slate-700">{formatCurrency(family.walletBalance)}</span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-slate-500 hover:bg-slate-100">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              <DropdownMenuItem onClick={() => setViewingFamily(family)}>
                                <Eye className="mr-2 h-3.5 w-3.5" />View details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEdit(family)}>
                                <Edit2 className="mr-2 h-3.5 w-3.5" />Edit family
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-rose-600 focus:bg-rose-50 focus:text-rose-700"
                                onClick={() => setFamilyToDelete(family)}
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5" />Delete family
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5">
              <p className="text-[11px] text-slate-400">
                {(paginated.currentPage - 1) * PAGE_SIZE + 1}–{Math.min(paginated.currentPage * PAGE_SIZE, filtered.length)} of {filtered.length} families
              </p>
              <Pagination className="mx-0 w-auto justify-end">
                <PaginationContent>
                  <PaginationItem>
                    <PaginationPrevious href="#" className={cn("h-7 text-xs", paginated.currentPage === 1 && "pointer-events-none opacity-40")} onClick={(e) => { e.preventDefault(); setCurrentPage((p) => Math.max(1, p - 1)); }} />
                  </PaginationItem>
                  <PaginationItem>
                    <span className="px-3 text-[11px] text-slate-400">Page {paginated.currentPage} / {paginated.totalPages}</span>
                  </PaginationItem>
                  <PaginationItem>
                    <PaginationNext href="#" className={cn("h-7 text-xs", paginated.currentPage === paginated.totalPages && "pointer-events-none opacity-40")} onClick={(e) => { e.preventDefault(); setCurrentPage((p) => Math.min(paginated.totalPages, p + 1)); }} />
                  </PaginationItem>
                </PaginationContent>
              </Pagination>
            </div>
          )}
        </Card>

        <Sheet open={!!viewingFamily} onOpenChange={(open) => !open && setViewingFamily(null)}>
          <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
            {viewingFamily && (() => {
              const guardian = viewingFamily.guardianDetails?.primary ?? null;
              const notes = viewingFamily.guardianDetails?.notes ?? null;
              return (
                <>
                  <SheetHeader>
                    <SheetTitle className="flex items-center gap-2 text-base font-semibold">
                      <FamilyAvatar name={viewingFamily.name} />
                      {viewingFamily.name}
                    </SheetTitle>
                    <SheetDescription className="text-xs text-slate-500">
                      Family ID #{viewingFamily.id} · {viewingFamily.siblingCount} linked member{viewingFamily.siblingCount === 1 ? "" : "s"}
                    </SheetDescription>
                  </SheetHeader>

                  <div className="mt-5 space-y-5">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-rose-100 bg-rose-50/40 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-rose-500">Outstanding</p>
                        <p className="mt-0.5 text-lg font-bold text-rose-700">{formatCurrency(viewingFamily.totalOutstanding)}</p>
                      </div>
                      <div className="rounded-lg border border-violet-100 bg-violet-50/40 p-3">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-500">Wallet</p>
                        <p className="mt-0.5 text-lg font-bold text-violet-700">{formatCurrency(viewingFamily.walletBalance)}</p>
                      </div>
                    </div>

                    <section className="rounded-lg border border-slate-100 bg-slate-50/40 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Primary guardian</p>
                      {guardian && Object.values(guardian).some(Boolean) ? (
                        <div className="mt-2 space-y-1.5">
                          {guardian.name && (
                            <p className="text-sm font-semibold text-slate-900">
                              {guardian.name}
                              {guardian.relation && <span className="ml-2 text-xs font-normal text-slate-500">({guardian.relation})</span>}
                            </p>
                          )}
                          <div className="grid grid-cols-1 gap-1.5 text-[12px] text-slate-600">
                            {guardian.phone && <p className="flex items-center gap-1.5"><Phone className="h-3 w-3 text-slate-400" />{guardian.phone}</p>}
                            {guardian.email && <p className="flex items-center gap-1.5"><Mail className="h-3 w-3 text-slate-400" />{guardian.email}</p>}
                            {guardian.cnic && <p className="flex items-center gap-1.5"><IdCard className="h-3 w-3 text-slate-400" />{guardian.cnic}</p>}
                            {guardian.occupation && <p className="flex items-center gap-1.5"><Briefcase className="h-3 w-3 text-slate-400" />{guardian.occupation}</p>}
                            {guardian.address && <p className="flex items-center gap-1.5"><MapPin className="h-3 w-3 text-slate-400" />{guardian.address}</p>}
                          </div>
                        </div>
                      ) : (
                        <p className="mt-2 text-xs italic text-slate-400">No guardian information on file.</p>
                      )}
                      {notes && (
                        <p className="mt-3 border-t border-slate-200 pt-2 text-[12px] text-slate-600"><span className="font-semibold text-slate-700">Notes: </span>{notes}</p>
                      )}
                    </section>

                    <section>
                      <div className="mb-2 flex items-center justify-between">
                        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Linked members</p>
                        <span className="text-[11px] text-slate-400">{viewingFamily.siblings.length} total</span>
                      </div>
                      {viewingFamily.siblings.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-3 py-6 text-center text-xs italic text-slate-400">
                          No members linked to this family yet.
                        </p>
                      ) : (
                        <ul className="space-y-2">
                          {viewingFamily.siblings.map((member) => {
                            const profileHref = member.role === "student"
                              ? `/admin/students/${member.id}`
                              : `/admin/users/${member.id}`;
                            return (
                              <li key={member.id} className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-semibold text-slate-900">{member.name}</span>
                                    <RoleBadge role={member.role} />
                                  </div>
                                  <p className="mt-0.5 truncate text-[11px] text-slate-400">
                                    {member.email}
                                    {member.className ? ` · ${member.className}` : ""}
                                  </p>
                                </div>
                                <div className="ml-3 flex shrink-0 items-center gap-2">
                                  {member.role === "student" && (
                                    <span className={cn("text-[12px] font-semibold", member.outstandingBalance > 0 ? "text-rose-600" : "text-slate-500")}>
                                      {formatCurrency(member.outstandingBalance)}
                                    </span>
                                  )}
                                  <Button asChild variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-indigo-600 hover:bg-indigo-50">
                                    <Link href={profileHref}><ChevronRight className="h-4 w-4" /></Link>
                                  </Button>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </section>

                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" size="sm" onClick={() => { handleEdit(viewingFamily); setViewingFamily(null); }}>
                        <Edit2 className="mr-1.5 h-3.5 w-3.5" />Edit
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => { setFamilyToDelete(viewingFamily); setViewingFamily(null); }}>
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />Delete
                      </Button>
                    </div>
                  </div>
                </>
              );
            })()}
          </SheetContent>
        </Sheet>

        <AlertDialog open={!!familyToDelete} onOpenChange={(open) => !open && setFamilyToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete this family?</AlertDialogTitle>
              <AlertDialogDescription className="text-sm">
                This will permanently remove <strong>{familyToDelete?.name}</strong>. Linked students and users will be preserved but unlinked from this family unit ({familyToDelete?.siblingCount ?? 0} member{familyToDelete?.siblingCount === 1 ? "" : "s"}).
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="h-8 text-sm">Cancel</AlertDialogCancel>
              <AlertDialogAction className="h-8 bg-rose-600 text-sm hover:bg-rose-700" onClick={handleDelete}>
                {deleteFamily.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Delete family"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <CreateFamilyDialog
          open={createOpen}
          onOpenChange={handleDialogClose}
          initialData={editingFamily}
        />
      </div>
    </Layout>
  );
}
