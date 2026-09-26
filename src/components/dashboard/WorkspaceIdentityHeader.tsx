import type { ReactNode } from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ProfileAvatar } from "./ProfileAvatar";

interface WorkspaceIdentityHeaderProps {
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
  subtitle?: string | null;
  onOpenAccount: () => void;
  children?: ReactNode;
}

/** The single identity bar shared by company and officer workspaces. */
export function WorkspaceIdentityHeader({ name, email, avatarUrl, subtitle, onOpenAccount, children }: WorkspaceIdentityHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950 text-white">
      <div className="flex min-h-14 min-w-0 flex-wrap items-center gap-3 px-4 py-2">
        <SidebarTrigger aria-label="Open workspace menu" className="h-10 w-auto shrink-0 gap-2 border border-slate-600 bg-slate-900 px-3 text-white hover:bg-slate-800 hover:text-white md:h-8 md:w-8 md:border-0 md:bg-transparent md:px-0">
          <span className="md:sr-only">Menu</span>
        </SidebarTrigger>
        <button type="button" onClick={onOpenAccount} aria-label="Open account settings" className="flex min-w-0 flex-1 items-center gap-3 rounded-sm text-left hover:opacity-80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white">
          <ProfileAvatar name={name} email={email} src={avatarUrl} className="h-9 w-9 shrink-0 shadow-none" />
          <span className="min-w-0">
            <span className="block truncate text-base font-bold">{name || email || "Your account"}</span>
            <span className="block truncate text-xs text-slate-300">{subtitle}</span>
          </span>
        </button>
        {children}
      </div>
    </header>
  );
}
