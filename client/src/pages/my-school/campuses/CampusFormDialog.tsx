import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface CampusFormData {
  name: string;
  subdomain: string;
  address: string;
  contactInfo: {
    phone: string;
    email: string;
  };
  isActive?: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: CampusFormData) => void;
  initialData?: CampusFormData & { id?: number };
  isSubmitting?: boolean;
}

export function CampusFormDialog({
  open,
  onClose,
  onSubmit,
  initialData,
  isSubmitting,
}: Props) {
  const [form, setForm] = useState<CampusFormData>({
    name: "",
    subdomain: "",
    address: "",
    contactInfo: { phone: "", email: "" },
  });

  useEffect(() => {
    if (initialData) {
      setForm({
        name: initialData.name,
        subdomain: initialData.subdomain,
        address: initialData.address,
        contactInfo: { ...initialData.contactInfo },
        isActive: initialData.isActive,
      });
    } else {
      setForm({
        name: "",
        subdomain: "",
        address: "",
        contactInfo: { phone: "", email: "" },
      });
    }
  }, [initialData, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(form);
  };

  const title = initialData ? "Edit Campus" : "Create Campus";

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Campus Name</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                placeholder="e.g. Main Campus"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="subdomain">Subdomain</Label>
              <Input
                id="subdomain"
                value={form.subdomain}
                onChange={(e) =>
                  setForm({ ...form, subdomain: e.target.value })
                }
                required
                placeholder="e.g. main-campus"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address">Address</Label>
            <Input
              id="address"
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
              required
              placeholder="123 School Street"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={form.contactInfo.phone}
                onChange={(e) =>
                  setForm({
                    ...form,
                    contactInfo: { ...form.contactInfo, phone: e.target.value },
                  })
                }
                required
                placeholder="+92 300 1234567"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.contactInfo.email}
                onChange={(e) =>
                  setForm({
                    ...form,
                    contactInfo: { ...form.contactInfo, email: e.target.value },
                  })
                }
                required
                placeholder="campus@school.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting
                ? "Saving..."
                : initialData
                  ? "Update Campus"
                  : "Create Campus"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
