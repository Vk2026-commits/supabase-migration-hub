import { NavLink } from "@/lib/router-compat";
import { Briefcase, Users, Heart, UserCheck, UserX, Building2, CheckCircle2, CreditCard, UsersRound, MapPinned, LayoutDashboard, Settings } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

interface CompanySidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  profileComplete: boolean;
  pendingOnboardingReviews?: number;
  companyId?: string;
}

export function CompanySidebar({ activeTab, onTabChange, profileComplete, pendingOnboardingReviews = 0, companyId }: CompanySidebarProps) {
  const { open } = useSidebar();

  const groups = [
    {
      label: "Overview",
      items: [{ title: "Dashboard", value: "overview", icon: LayoutDashboard }],
    },
    {
      label: "Recruiting",
      items: [
        { title: "Find Officers", value: "browse", icon: Users },
        { title: "Job Postings", value: "jobs", icon: Briefcase },
        { title: "Interested Officers", value: "interested", icon: Heart },
      ],
    },
    {
      label: "Hiring Process",
      items: [
        { title: "Applicants", value: "applicants", icon: UserCheck },
        { title: "Hired Officers", value: "employment", icon: UserCheck },
        { title: "Not Hired", value: "not-hired", icon: UserX },
      ],
    },
    {
      label: "Company Management",
      items: [
        { title: "Client Sites", value: "sites", icon: MapPinned },
        { title: "Company Profile", value: "profile", icon: Building2 },
        { title: "Team", value: "team", icon: UsersRound },
        { title: "Subscriptions", value: "subscriptions", icon: CreditCard },
        { title: "Account Settings", value: "account", icon: Settings },
      ],
    },
  ];

  const getNavCls = (value: string) =>
    activeTab === value
      ? "relative bg-primary/10 text-primary font-semibold ring-1 ring-inset ring-primary/20 before:absolute before:inset-y-1 before:left-0 before:w-1 before:rounded-r-full before:bg-primary"
      : "hover:bg-muted/50";

  return (
    <Sidebar className={open ? "w-60" : "w-14"} collapsible="icon">
      <div className="flex h-14 items-center justify-center border-b bg-slate-950 text-white">
        <span className={`text-sm font-semibold ${!open && "hidden"}`}>Company workspace</span>
      </div>
      <SidebarContent>
        {groups.map((group, groupIndex) => (
          <div key={group.label}>
            {groupIndex > 0 && <SidebarSeparator className="mx-3 w-auto" />}
            <SidebarGroup className="py-2">
              <SidebarGroupLabel className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground/80">{group.label}</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>
                  {group.items.map((item) => (
                    <SidebarMenuItem key={item.value}>
                      {item.value === "browse" ? (
                        <SidebarMenuButton asChild tooltip={item.title}>
                          <NavLink to={companyId ? `/browse?companyId=${encodeURIComponent(companyId)}` : "/browse"} className="flex items-center gap-2" aria-label="Find security officers">
                            <item.icon className="h-4 w-4" />
                            {open && <span>{item.title}</span>}
                          </NavLink>
                        </SidebarMenuButton>
                      ) : (
                        <SidebarMenuButton
                          onClick={() => onTabChange(item.value)}
                          aria-current={activeTab === item.value ? "page" : undefined}
                          isActive={activeTab === item.value}
                          className={getNavCls(item.value)}
                          tooltip={item.title}
                        >
                          {item.value === "profile" && profileComplete ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <item.icon className="h-4 w-4" />}
                          {open && <span className="flex min-w-0 flex-1 items-center justify-between gap-2"><span>{item.title}</span>{item.value === "profile" && profileComplete && <span className="text-xs font-semibold text-emerald-600">Complete</span>}{item.value === "employment" && pendingOnboardingReviews > 0 && <span className="rounded-full bg-amber-500 px-2 py-0.5 text-[11px] font-bold text-white" aria-label={`${pendingOnboardingReviews} onboarding reviews pending`}>{pendingOnboardingReviews}</span>}</span>}
                        </SidebarMenuButton>
                      )}
                    </SidebarMenuItem>
                  ))}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </div>
        ))}
      </SidebarContent>
    </Sidebar>
  );
}
