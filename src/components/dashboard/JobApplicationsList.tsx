import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Briefcase } from "lucide-react";
import { ChatDialog } from "./ChatDialog";
import { ProfileAvatar } from "./ProfileAvatar";
import { Input } from "@/components/ui/input";
import "./InterestedRoster.css";

interface JobApplicationsListProps {
  companyId: string;
  onOpenOfficer?: (officerId: string) => void;
}

export default function JobApplicationsList({ companyId, onOpenOfficer }: JobApplicationsListProps) {
  const queryClient = useQueryClient();
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedOfficer, setSelectedOfficer] = useState<any>(null);
  const [companyProfile, setCompanyProfile] = useState<any>(null);
  const [search, setSearch] = useState("");

  const { data: jobApplications, isLoading, error, refetch } = useQuery({
    queryKey: ["job-applications-for-company", companyId],
    queryFn: async () => {
      // Get company profile for chat
      const { data: companyData } = await supabase
        .from("company_profiles")
        .select("company_name")
        .eq("id", companyId)
        .single();
      
      if (companyData) setCompanyProfile(companyData);

      // Get all job postings for this company
      const { data: jobPostings, error: jobError } = await supabase
        .from("job_postings")
        .select("id, title, location, status")
        .eq("company_id", companyId);

      if (jobError) throw jobError;
      if (!jobPostings || jobPostings.length === 0) return [];

      const jobPostingIds = jobPostings.map(jp => jp.id);

      // Get all applications for these job postings with officer details
      const { data: applications, error: appError } = await supabase
        .from("job_applications")
        .select(`
          *,
          officer_profiles (
            id,
            user_id,
            title,
            location,
            availability_status,
            years_experience,
            avatar_url,
            profiles (full_name, email)
          ),
          job_postings (
            id,
            title,
            location,
            status
          )
        `)
        .in("job_posting_id", jobPostingIds)
        .eq("status", "interested")
        .order("created_at", { ascending: false });

      if (appError) throw appError;

      return applications || [];
    },
  });

  // Group applications by job posting
  const filteredApplications = jobApplications?.filter(app => [app.officer_profiles?.profiles?.full_name, app.officer_profiles?.location, app.job_postings?.title, app.job_postings?.location].join(" ").toLowerCase().includes(search.trim().toLowerCase()));
  const groupedApplications = filteredApplications?.reduce((acc: any, app: any) => {
    const jobId = app.job_posting_id;
    if (!acc[jobId]) {
      acc[jobId] = {
        jobPosting: app.job_postings,
        applications: []
      };
    }
    acc[jobId].applications.push(app);
    return acc;
  }, {});

  if (isLoading) {
    return <div role="status" className="space-y-2 border p-3"><p className="text-sm text-muted-foreground">Loading interested officers…</p>{[0,1,2].map(index => <div key={index} className="h-14 animate-pulse bg-muted" />)}</div>;
  }

  if (error) return <div role="alert" className="border p-4 text-sm">Could not load job interest. <Button variant="outline" size="sm" onClick={() => void refetch()}>Retry</Button></div>;

  if (!jobApplications || jobApplications.length === 0) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-center">
            No interested applicants yet. Officers will appear here when they express interest in your job postings.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Officers who responded to your job postings.</p>
        <Badge variant="secondary" className="shrink-0 text-xs">
          {jobApplications.length} responses
        </Badge>
      </div>
      <Input aria-label="Search officers interested in jobs" placeholder="Search officer, position, or location" value={search} onChange={event => setSearch(event.target.value)} />
      {filteredApplications?.length === 0 && <p className="border p-4 text-sm text-muted-foreground">No officers match your search.</p>}

      {Object.entries(groupedApplications || {}).map(([jobId, group]: [string, any]) => (
        <Card key={jobId} className="interested-job-group gap-0 rounded-none py-0 shadow-none">
          <CardHeader className="bg-muted/50 px-3 py-2">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  {group.jobPosting?.title || "Job Posting"}
                </CardTitle>
                <CardDescription className="mt-1">
                  {group.jobPosting?.location || "Location not specified"}
                </CardDescription>
              </div>
              <Badge>
                {group.applications.length} Interested
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {group.applications.map((application: any) => (
              <div key={application.id} className="interested-officer-row border-t px-3 py-3">
                <CardHeader className="contents">
                  <div className="flex justify-between items-start">
                    <div className="flex min-w-0 items-center gap-3">
                      <ProfileAvatar name={application.officer_profiles?.profiles?.full_name} email={application.officer_profiles?.profiles?.email} src={application.officer_profiles?.avatar_url} className="h-9 w-9 shrink-0" />
                      <div className="min-w-0">
                        <CardTitle className="text-sm">
                          {application.officer_profiles?.profiles?.full_name || "Officer"}
                        </CardTitle>
                        <CardDescription>
                          {application.officer_profiles?.title || "Security Officer"}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant="secondary" className="ml-2 shrink-0 whitespace-nowrap text-xs">
                      {application.officer_profiles?.availability_status || "Available"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="contents">
                  <div className="contents">
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Location:</span>
                        <p className="font-medium">
                          {application.officer_profiles?.location || "Not specified"}
                        </p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Experience:</span>
                        <p className="font-medium">
                          {application.officer_profiles?.years_experience || 0} years
                        </p>
                      </div>
                    </div>
                    
                    {application.message && (
                      <details className="interested-officer-message text-sm">
                        <summary className="cursor-pointer text-primary">Officer message</summary>
                        <p className="text-sm text-muted-foreground">{application.message}</p>
                      </details>
                    )}

                    <div className="interested-officer-actions flex flex-wrap gap-2">
                      {onOpenOfficer && <Button size="sm" disabled={!application.officer_profiles?.id} onClick={() => onOpenOfficer(application.officer_profiles!.id)}>View profile</Button>}
                      <Button 
                        variant="outline"
                        size="sm"
                        disabled={!application.officer_profiles?.id}
                        onClick={() => {
                          setSelectedOfficer({
                            id: application.officer_profiles?.id,
                            name: application.officer_profiles?.profiles?.full_name,
                            jobApplicationId: application.id,
                            jobTitle: group.jobPosting?.title,
                          });
                          setChatOpen(true);
                        }}
                      >
                        <MessageCircle className="w-4 h-4 mr-2" />
                        Chat
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {chatOpen && selectedOfficer && companyProfile && (
        <ChatDialog
          open={chatOpen}
          onOpenChange={setChatOpen}
          companyId={companyId}
          companyName={companyProfile.company_name}
          officerId={selectedOfficer.id}
          officerName={selectedOfficer.name}
          currentUserType="company"
          jobApplicationId={selectedOfficer.jobApplicationId}
          jobTitle={selectedOfficer.jobTitle}
        />
      )}
    </div>
  );
}
