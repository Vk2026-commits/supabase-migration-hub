import { NavLink } from "@/lib/router-compat";
import { Briefcase, Users, Heart, UserCheck, Building2, CreditCard } from "lucide-react";
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
}

export function CompanySidebar({ activeTab, onTabChange }: CompanySidebarProps) {
  const { open } = useSidebar();

  const items = [
    { title: "Company Profile", value: "profile", icon: Building2 },
    { title: "Browse Guards", value: "browse", icon: Users },
    { title: "Job Postings", value: "jobs", icon: Briefcase },
    { title: "Applicants", value: "applicants", icon: UserCheck },
    { title: "Interested", value: "interested", icon: Heart },
    { title: "Hired", value: "employment", icon: UserCheck },
    { title: "Subscriptions", value: "subscriptions", icon: CreditCard },
  ];

  const getNavCls = (value: string) =>
    activeTab === value
      ? "bg-accent text-accent-foreground font-medium"
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
                      className={getNavCls(item.value)}
                    >
                      <item.icon className="h-4 w-4" />
                      {open && <span>{item.title}</span>}
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
