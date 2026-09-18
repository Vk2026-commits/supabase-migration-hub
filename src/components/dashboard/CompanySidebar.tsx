import { NavLink } from "@/lib/router-compat";
import { Briefcase, Users, Heart, UserCheck, Building2, CheckCircle2, CreditCard, UsersRound, MapPinned, LayoutDashboard, Settings } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

interface CompanySidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  profileComplete: boolean;
}

export function CompanySidebar({ activeTab, onTabChange, profileComplete }: CompanySidebarProps) {
  const { open } = useSidebar();

  const items = [
    { title: "Dashboard", value: "overview", icon: LayoutDashboard },
    { title: "Company Profile", value: "profile", icon: Building2 },
    { title: "Browse Guards", value: "browse", icon: Users },
    { title: "Job Postings", value: "jobs", icon: Briefcase },
    { title: "Client Sites", value: "sites", icon: MapPinned },
    { title: "Applicants", value: "applicants", icon: UserCheck },
    { title: "Interested", value: "interested", icon: Heart },
    { title: "Hired", value: "employment", icon: UserCheck },
    { title: "Team", value: "team", icon: UsersRound },
    { title: "Subscriptions", value: "subscriptions", icon: CreditCard },
    { title: "Account Settings", value: "account", icon: Settings },
  ];

  const getNavCls = (value: string) =>
    activeTab === value
      ? "relative bg-primary/10 text-primary font-semibold ring-1 ring-inset ring-primary/20 before:absolute before:inset-y-1 before:left-0 before:w-1 before:rounded-r-full before:bg-primary"
      : "hover:bg-muted/50";

  return (
    <Sidebar className={open ? "w-60" : "w-14"} collapsible="icon">
      <div className="h-16 border-b flex items-center justify-center">
        <span className={`font-semibold ${!open && "hidden"}`}>Menu</span>
      </div>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Company Dashboard</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.value}>
                  {item.value === "browse" ? (
                    <SidebarMenuButton asChild>
                      <NavLink to="/browse" className="flex items-center gap-2">
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
                    >
                      {item.value === "profile" && profileComplete ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <item.icon className="h-4 w-4" />}
                      {open && <span className="flex min-w-0 flex-1 items-center justify-between gap-2"><span>{item.title}</span>{item.value === "profile" && profileComplete && <span className="text-xs font-semibold text-emerald-600">Complete</span>}</span>}
                    </SidebarMenuButton>
                  )}
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
