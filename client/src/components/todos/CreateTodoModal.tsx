import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "lucide-react";
import { useCreateTodo } from "@/hooks/useTodos";
import { toast } from "@/hooks/use-toast";

const createTodoSchema = z.object({
  content: z.string().min(1, "Content is required").max(500),
  reminderAt: z.string().optional(),
});

type CreateTodoForm = z.infer<typeof createTodoSchema>;

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreateTodoModal({ isOpen, onClose }: ModalProps) {
  const { register, handleSubmit, reset, formState: { errors } } = useForm<CreateTodoForm>({
    resolver: zodResolver(createTodoSchema),
  });

  const createMutation = useCreateTodo();

  const onSubmit = (data: CreateTodoForm) => {
    createMutation.mutate(
      {
        content: data.content,
        reminderAt: data.reminderAt || null,
      },
      {
        onSuccess: () => {
          reset();
          onClose();
          toast({ title: "Todo created", description: "Your todo has been created successfully." });
        },
        onError: () => {
          toast({ title: "Error", description: "Failed to create todo. Please try again.", variant: "destructive" });
        },
      },
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-white border-slate-200 max-w-md shadow-lg">
        <DialogHeader>
          <DialogTitle className="text-slate-900">Create Todo</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 py-2">
          <div>
            <Input
              {...register("content")}
              placeholder="What needs to be done?"
              className="border-slate-200 text-slate-800 placeholder:text-slate-400"
            />
            {errors.content && (
              <p className="text-xs text-red-500 mt-1">{errors.content.message}</p>
            )}
          </div>

          <div className="relative">
            <Input
              {...register("reminderAt")}
              type="datetime-local"
              placeholder="Reminder (optional)"
              className="border-slate-200 text-slate-600 pr-10"
            />
            <Calendar className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-50"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending}
              className="bg-indigo-600 hover:bg-indigo-500 text-white shadow-sm"
            >
              {createMutation.isPending ? "Creating..." : "Create"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
