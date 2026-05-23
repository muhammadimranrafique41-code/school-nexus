import { Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePlatformSettings, useUpdatePlatformSetting } from "@/hooks/super-admin/usePlatformSettings";
import { SettingField } from "./SettingField";
import { Skeleton } from "@/components/ui/skeleton";

export default function PlatformSettingsPage() {
  const { toast } = useToast();
  const { data: settings, isLoading } = usePlatformSettings();
  const updateSetting = useUpdatePlatformSetting();

  const handleSave = async (key: string, value: unknown) => {
    try {
      await updateSetting.mutateAsync({ key, value });
      toast({ title: `Setting "${key}" updated successfully` });
    } catch {
      toast({ title: `Failed to update "${key}"`, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4 md:space-y-6 p-4 md:p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-900 text-white">
          <Settings className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-slate-950 md:text-2xl">Platform Settings</h1>
          <p className="text-sm text-slate-500">Configure global platform parameters.</p>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
          {settings?.map((setting) => (
            <SettingField
              key={setting.key}
              setting={setting}
              onSave={handleSave}
              isSaving={updateSetting.isPending}
            />
          ))}
          {(!settings || settings.length === 0) && (
            <p className="text-sm text-slate-400 col-span-full text-center py-8">
              No settings configured.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
