import type { LucideIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Props = {
  title: string;
  value: string | number;
  icon: LucideIcon;
  gradient: string;
  iconClass: string;
};

export function HomeworkStatCard({ title, value, icon: Icon, gradient, iconClass }: Props) {
  return (
    <Card className="overflow-hidden border-white/60 bg-white/80 shadow-sm">
      <CardContent className="flex items-center justify-between p-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{title}</p>
          <p className="mt-2 text-3xl font-display font-bold text-slate-900">{value}</p>
        </div>
        <div className={cn("rounded-2xl bg-gradient-to-br p-3 text-white", gradient)}>
          <Icon className={cn("h-5 w-5", iconClass)} />
        </div>
      </CardContent>
    </Card>
  );
}
