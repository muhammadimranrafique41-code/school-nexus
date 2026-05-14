import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import type { PlatformSetting } from "@/lib/api/superAdminApi";

interface SettingFieldProps {
  setting: PlatformSetting;
  onSave: (key: string, value: unknown) => void;
  isSaving: boolean;
}

export function SettingField({ setting, onSave, isSaving }: SettingFieldProps) {
  const [value, setValue] = useState(() => String(setting.value ?? ""));

  const isBoolean = typeof setting.value === "boolean";
  const isNumber = typeof setting.value === "number";

  const handleSave = () => {
    let parsed: unknown = value;
    if (isNumber) parsed = Number(value);
    else if (isBoolean) parsed = value === "true";
    onSave(setting.key, parsed);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="space-y-1 mb-3">
        <Label className="text-sm font-medium text-slate-900">{setting.key.replace(/_/g, " ")}</Label>
        {setting.description && (
          <p className="text-xs text-slate-500">{setting.description}</p>
        )}
        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
          {setting.category}
        </span>
      </div>

      {isBoolean ? (
        <div className="flex items-center gap-3">
          <Switch
            checked={value === "true"}
            onCheckedChange={(checked) => setValue(String(checked))}
          />
          <span className="text-sm text-slate-600">{value === "true" ? "Enabled" : "Disabled"}</span>
        </div>
      ) : (
        <Input
          type={isNumber ? "number" : "text"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
      )}

      <div className="mt-3 flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={isSaving}>
          {isSaving ? "Saving..." : "Save"}
        </Button>
      </div>
    </div>
  );
}
