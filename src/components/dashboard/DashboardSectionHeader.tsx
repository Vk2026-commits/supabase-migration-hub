import { forwardRef } from "react";
import type { LucideIcon } from "lucide-react";

type StatusTone = "blue" | "green" | "amber" | "neutral";

interface DashboardSectionHeaderProps {
  icon: LucideIcon;
  title: string;
  description: string;
  eyebrow: string;
  status?: { label: string; tone?: StatusTone };
}

const statusClasses: Record<StatusTone, string> = {
  blue: "border-blue-200 bg-blue-50 text-blue-800",
  green: "border-green-200 bg-green-50 text-green-800",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  neutral: "border-border bg-muted text-muted-foreground",
};

export const DashboardSectionHeader = forwardRef<HTMLDivElement, DashboardSectionHeaderProps>(
  ({ icon: Icon, title, description, eyebrow, status }, ref) => (
    <div
      ref={ref}
      tabIndex={-1}
      className="scroll-mt-20 border-b bg-background px-4 py-3 outline-none ring-offset-background motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200 focus-visible:ring-2 focus-visible:ring-primary sm:px-5"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <h1 className="text-xl font-bold tracking-tight">{title}</h1>
              <p className="text-[11px] font-bold uppercase tracking-[.14em] text-primary">{eyebrow}</p>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
          </div>
        </div>
        {status ? (
          <span
            className={`w-fit shrink-0 rounded-full border px-3 py-1 text-xs font-semibold ${statusClasses[status.tone || "neutral"]}`}
          >
            {status.label}
          </span>
        ) : null}
      </div>
    </div>
  ),
);

DashboardSectionHeader.displayName = "DashboardSectionHeader";
