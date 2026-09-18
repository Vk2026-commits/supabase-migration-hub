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
      className="scroll-mt-24 rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-background to-background px-5 py-4 outline-none ring-offset-background motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-300 focus-visible:ring-2 focus-visible:ring-primary sm:px-6"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[.16em] text-primary">{eyebrow}</p>
            <h1 className="mt-0.5 text-2xl font-bold tracking-tight">{title}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
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
