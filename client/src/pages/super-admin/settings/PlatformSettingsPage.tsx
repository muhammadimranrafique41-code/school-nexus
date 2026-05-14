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
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Platform Settings</h1>
        <p className="text-sm text-slate-500">Configure global platform parameters.</p>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
