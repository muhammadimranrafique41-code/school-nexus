import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useCreateFamily } from "@/hooks/use-families";
import { getErrorMessage } from "@/lib/utils";

const familyFormSchema = z.object({
  name: z.string().trim().min(2, "Family name must be at least 2 characters").max(160),
  primaryName: z.string().trim().max(120).optional(),
  primaryRelation: z.string().trim().max(60).optional(),
  primaryPhone: z.string().trim().max(40).optional(),
  primaryEmail: z.union([z.string().trim().email("Invalid email"), z.literal("")]).optional(),
  primaryAddress: z.string().trim().max(240).optional(),
  notes: z.string().trim().max(500).optional(),
});

type FamilyFormValues = z.infer<typeof familyFormSchema>;

type CreateFamilyDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultName?: string;
  onCreated?: (family: { id: number; name: string }) => void;
};

export function CreateFamilyDialog({
  open,
  onOpenChange,
  defaultName,
  onCreated,
}: CreateFamilyDialogProps) {
  const { toast } = useToast();
  const createFamily = useCreateFamily();

  const form = useForm<FamilyFormValues>({
    resolver: zodResolver(familyFormSchema),
    defaultValues: {
      name: defaultName ?? "",
      primaryName: "",
      primaryRelation: "",
      primaryPhone: "",
      primaryEmail: "",
      primaryAddress: "",
      notes: "",
    },
  });

  useEffect(() => {
    if (open) {
      form.reset({
        name: defaultName ?? "",
        primaryName: "",
        primaryRelation: "",
        primaryPhone: "",
        primaryEmail: "",
        primaryAddress: "",
        notes: "",
      });
    }
  }, [open, defaultName, form]);

  const onSubmit = async (values: FamilyFormValues) => {
    try {
      const guardianHasContent = Boolean(
        values.primaryName || values.primaryRelation || values.primaryPhone ||
          values.primaryEmail || values.primaryAddress || values.notes,
      );
      const created = await createFamily.mutateAsync({
        name: values.name,
        guardianDetails: guardianHasContent
          ? {
              primary: {
                name: values.primaryName || null,
                relation: values.primaryRelation || null,
                phone: values.primaryPhone || null,
                email: values.primaryEmail || null,
                address: values.primaryAddress || null,
              },
              notes: values.notes || null,
            }
          : undefined,
      });
      toast({
        title: "Family created",
        description: `${created.name} is ready to be linked to students.`,
      });
      onCreated?.({ id: created.id, name: created.name });
      onOpenChange(false);
    } catch (error) {
      toast({
        title: "Unable to create family",
        description: getErrorMessage(error),
        variant: "destructive",
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">Create new family</DialogTitle>
          <DialogDescription className="text-xs text-slate-500">
            Group siblings under a single family unit. Guardian details are optional and can be edited later.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-2">
            <FormField control={form.control} name="name" render={({ field }) => (
              <FormItem>
                <FormLabel className="text-xs font-medium text-slate-700">Family name *</FormLabel>
                <FormControl><Input className="h-8 text-sm" placeholder="e.g. Khan Family" {...field} /></FormControl>
                <FormMessage className="text-[11px]" />
              </FormItem>
            )} />
            <div className="space-y-3 rounded-lg border border-slate-100 bg-slate-50/40 p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-500">Primary guardian (optional)</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField control={form.control} name="primaryName" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs font-medium text-slate-700">Name</FormLabel><FormControl><Input className="h-8 text-sm" placeholder="Guardian name" {...field} value={field.value ?? ""} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                )} />
                <FormField control={form.control} name="primaryRelation" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs font-medium text-slate-700">Relation</FormLabel><FormControl><Input className="h-8 text-sm" placeholder="Father / Mother / Guardian" {...field} value={field.value ?? ""} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                )} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField control={form.control} name="primaryPhone" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs font-medium text-slate-700">Phone</FormLabel><FormControl><Input className="h-8 text-sm" placeholder="+1234..." {...field} value={field.value ?? ""} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                )} />
                <FormField control={form.control} name="primaryEmail" render={({ field }) => (
                  <FormItem><FormLabel className="text-xs font-medium text-slate-700">Email</FormLabel><FormControl><Input type="email" className="h-8 text-sm" placeholder="guardian@example.com" {...field} value={field.value ?? ""} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="primaryAddress" render={({ field }) => (
                <FormItem><FormLabel className="text-xs font-medium text-slate-700">Address</FormLabel><FormControl><Input className="h-8 text-sm" placeholder="Home address" {...field} value={field.value ?? ""} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
              )} />
              <FormField control={form.control} name="notes" render={({ field }) => (
                <FormItem><FormLabel className="text-xs font-medium text-slate-700">Notes</FormLabel><FormControl><Input className="h-8 text-sm" placeholder="Internal notes (optional)" {...field} value={field.value ?? ""} /></FormControl><FormMessage className="text-[11px]" /></FormItem>
              )} />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button type="submit" size="sm" disabled={createFamily.isPending}>
                {createFamily.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Create family"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
