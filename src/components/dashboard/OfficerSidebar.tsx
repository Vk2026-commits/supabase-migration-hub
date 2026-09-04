import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { User, Clock, Images, Award, Briefcase, Check, MessageCircle, Search, Video, ClipboardList, ClipboardCheck } from "lucide-react";

interface OfficerSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  completionStatus?: {
    profile: boolean;
    availability: boolean;
    photos: boolean;
    certifications: boolean;
    workHistory: boolean;
    employeeOnboarding?: boolean;
    messages?: boolean;
  };
}

export function OfficerSidebar({ activeTab, onTabChange, completionStatus }: OfficerSidebarProps) {
  const { open } = useSidebar();

  const items = [
    { title: "Hiring Application", value: "hiring-application", icon: ClipboardList },
    { title: "Employee Onboarding", value: "employee-onboarding", icon: ClipboardCheck },
    { title: "Profile", value: "profile", icon: User },
    { title: "Availability", value: "availability", icon: Clock },
    { title: "Photos", value: "photos", icon: Images },
    { title: "Certifications and Certificates", value: "certifications", icon: Award },
    { title: "Work History", value: "work-history", icon: Briefcase },
    { title: "Video Interviews", value: "videos", icon: Video },
    { title: "Find a Job", value: "find-jobs", icon: Search },
    { title: "Messages", value: "messages", icon: MessageCircle },
  ];

  const getNavCls = (value: string) => {
    // Messages and Find a Job tabs don't need completion status
    if (value === 'hiring-application') {
      return activeTab === value ? "font-semibold bg-primary text-primary-foreground hover:bg-primary/90" : "font-semibold bg-primary/10 text-primary hover:bg-primary/15";
    }
    if (value === 'messages' || value === 'find-jobs' || value === 'videos' || value === 'employee-onboarding') {
      return activeTab === value ? "font-medium bg-accent text-accent-foreground" : "hover:bg-muted/50";
    }
    
    const completionKey = value === "employee-onboarding" ? "employeeOnboarding" : value;
    const isComplete = completionStatus?.[completionKey as keyof typeof completionStatus];
    const baseClasses = activeTab === value ? "font-medium" : "hover:bg-muted/50";
    const statusColor = isComplete ? "bg-blue-500/10 text-blue-600 hover:bg-blue-500/20" : "bg-red-500/10 text-red-600 hover:bg-red-500/20";
    return `${baseClasses} ${statusColor}`;
  };

  const isTabComplete = (value: string) => {
    if (value === 'messages' || value === 'find-jobs' || value === 'videos' || value === 'hiring-application') return false;
    const completionKey = value === "employee-onboarding" ? "employeeOnboarding" : value;
    return completionStatus?.[completionKey as keyof typeof completionStatus];
  };

  return (
    <Sidebar className={open ? "w-60" : "w-14"} collapsible="icon">
      <div className="h-16 border-b flex items-center justify-center">
        <span className={`font-semibold ${!open && "hidden"}`}>Menu</span>
      </div>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Officer</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.map((item) => (
                <SidebarMenuItem key={item.value}>
                  <SidebarMenuButton
                    onClick={() => onTabChange(item.value)}
                    className={`h-auto min-h-9 py-2 ${getNavCls(item.value)}`}
                  >
                    <div className="flex min-w-0 w-full items-start gap-2">
                      <item.icon className="mt-0.5 h-4 w-4 shrink-0" />
                      {open && <span className="min-w-0 flex-1 break-words text-left leading-tight">{item.title}{item.value === "hiring-application" && <span className="ml-2 inline-flex whitespace-nowrap rounded-full bg-primary/15 px-2 py-0.5 text-[10px] uppercase tracking-wide group-data-[active=true]:bg-white/15">Start here</span>}{item.value === "employee-onboarding" && <span className="ml-2 inline-flex whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-[10px] uppercase tracking-wide">After hire</span>}</span>}
                      {isTabComplete(item.value) && open && item.value !== 'messages' && item.value !== 'find-jobs' && (
                        <Check className="h-3 w-3 shrink-0 text-blue-600" />
                      )}
                    </div>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}
