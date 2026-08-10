import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageCircle, Briefcase } from "lucide-react";
import { ChatDialog } from "./ChatDialog";

interface JobApplicationsListProps {
  companyId: string;
}

export default function JobApplicationsList({ companyId }: JobApplicationsListProps) {
  const queryClient = useQueryClient();
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedOfficer, setSelectedOfficer] = useState<any>(null);
  const [companyProfile, setCompanyProfile] = useState<any>(null);

  const { data: jobApplications, isLoading } = useQuery({
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
  const groupedApplications = jobApplications?.reduce((acc: any, app: any) => {
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
    return <div>Loading applications...</div>;
  }

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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Interested Applicants</h2>
        <Badge variant="secondary" className="text-lg px-3 py-1">
          {jobApplications.length} Total
        </Badge>
      </div>

      {Object.entries(groupedApplications || {}).map(([jobId, group]: [string, any]) => (
        <Card key={jobId}>
          <CardHeader className="bg-muted/50">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Briefcase className="h-5 w-5" />
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
          <CardContent className="pt-6 space-y-4">
            {group.applications.map((application: any) => (
              <Card key={application.id} className="border-l-4 border-l-primary">
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div className="flex items-start gap-4">
                      {application.officer_profiles?.avatar_url && (
                        <img 
                          src={application.officer_profiles.avatar_url} 
                          alt="Avatar"
                          className="w-12 h-12 rounded-full object-cover"
                        />
                      )}
                      <div>
                        <CardTitle className="text-lg">
                          {application.officer_profiles?.profiles?.full_name || "Officer"}
                        </CardTitle>
                        <CardDescription>
                          {application.officer_profiles?.title || "Security Officer"}
                        </CardDescription>
                      </div>
                    </div>
                    <Badge variant="secondary">
                      {application.officer_profiles?.availability_status || "Available"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
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
                      <div className="bg-muted/50 p-3 rounded-md">
                        <p className="text-sm font-medium mb-1">Message:</p>
                        <p className="text-sm text-muted-foreground">{application.message}</p>
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <Button 
                        variant="default" 
                        className="flex-1"
                        onClick={() => {
                          setSelectedOfficer({
                            id: application.officer_profiles?.id,
                            name: application.officer_profiles?.profiles?.full_name
                          });
                          setChatOpen(true);
                        }}
                      >
                        <MessageCircle className="w-4 h-4 mr-2" />
                        Chat with Officer
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
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
        />
      )}
    </div>
  );
}
