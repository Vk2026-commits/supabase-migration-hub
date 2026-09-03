import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, useSidebar } from "@/components/ui/sidebar";
import { User, Clock, Images, Award, Briefcase, Check, MessageCircle, Search } from "lucide-react";

interface OfficerSidebarProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
  completionStatus?: {
    profile: boolean;
    availability: boolean;
    photos: boolean;
    certifications: boolean;
    workHistory: boolean;
    messages?: boolean;
  };
}

export function OfficerSidebar({ activeTab, onTabChange, completionStatus }: OfficerSidebarProps) {
  const { open } = useSidebar();

  const items = [
    { title: "Profile", value: "profile", icon: User },
    { title: "Availability", value: "availability", icon: Clock },
    { title: "Photos", value: "photos", icon: Images },
    { title: "Certifications and Certificates", value: "certifications", icon: Award },
    { title: "Work History", value: "work-history", icon: Briefcase },
    { title: "Find a Job", value: "find-jobs", icon: Search },
    { title: "Messages", value: "messages", icon: MessageCircle },
  ];

  const getNavCls = (value: string) => {
    // Messages and Find a Job tabs don't need completion status
    if (value === 'messages' || value === 'find-jobs') {
      return activeTab === value ? "font-medium bg-accent text-accent-foreground" : "hover:bg-muted/50";
    }
    
    const isComplete = completionStatus?.[value as keyof typeof completionStatus];
    const baseClasses = activeTab === value ? "font-medium" : "hover:bg-muted/50";
    const statusColor = isComplete ? "bg-blue-500/10 text-blue-600 hover:bg-blue-500/20" : "bg-red-500/10 text-red-600 hover:bg-red-500/20";
    return `${baseClasses} ${statusColor}`;
  };

  const isTabComplete = (value: string) => {
    if (value === 'messages' || value === 'find-jobs') return false; // Messages and Find a Job tabs don't show completion
    return completionStatus?.[value as keyof typeof completionStatus];
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
                    className={getNavCls(item.value)}
                  >
                    <div className="flex w-full items-center gap-2">
                      <item.icon className="h-4 w-4 shrink-0" />
                      {open && <span className="flex-1 text-center leading-tight">{item.title}</span>}
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
