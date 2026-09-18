import { useDeferredValue, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Lock, Mail, MessageCircle, Search, X } from "lucide-react";
import { ChatDialog } from "./ChatDialog";
import { ProfileAvatar } from "./ProfileAvatar";

interface InterestedOfficersProps {
  companyId: string;
  subscriptionTier?: string;
}

export default function InterestedOfficers({ companyId, subscriptionTier }: InterestedOfficersProps) {
  const queryClient = useQueryClient();
  const isFreeTier = !subscriptionTier || subscriptionTier === 'free';
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedOfficer, setSelectedOfficer] = useState<any>(null);
  const [companyProfile, setCompanyProfile] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [availabilityFilter, setAvailabilityFilter] = useState("all");
  const deferredSearchQuery = useDeferredValue(searchQuery.trim().toLowerCase());

  const { data: interests, isLoading } = useQuery({
    queryKey: ["officer-interests", companyId],
    queryFn: async () => {
      const [interestsResult, companyResult] = await Promise.all([
        supabase
          .from("officer_interests")
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
            )
          `)
          .eq("company_id", companyId)
          .order("created_at", { ascending: false }),
        supabase
          .from("company_profiles")
          .select("company_name")
          .eq("id", companyId)
          .single()
      ]);

      if (interestsResult.error) throw interestsResult.error;
      if (companyResult.data) setCompanyProfile(companyResult.data);
      
      return interestsResult.data;
    },
  });

  const removeInterestMutation = useMutation({
    mutationFn: async (interestId: string) => {
      const { error } = await supabase
        .from("officer_interests")
        .delete()
        .eq("id", interestId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["officer-interests"] });
      toast.success("Officer removed from list");
    },
    onError: () => {
      toast.error("Failed to remove officer");
    },
  });

  const updateInterestMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase
        .from("officer_interests")
        .update({ status })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["officer-interests"] });
      toast.success("Interest status updated");
    },
    onError: () => {
      toast.error("Failed to update interest");
    },
  });

  const handleSendInterestEmail = async (officerId: string) => {
    if (isFreeTier) {
      toast.error("Upgrade to Professional or Premium tier to send interest emails");
      return;
    }

    try {
      const { error } = await supabase.functions.invoke('express-interest', {
        body: { officerId }
      });
      
      if (error) {
        console.error('Error sending email:', error);
        toast.error('Failed to send interest email');
      } else {
        toast.success('Interest email sent to officer!');
      }
    } catch (error: any) {
      console.error('Error:', error);
      toast.error('Failed to send interest email');
    }
  };

  const interestedOfficers = interests?.filter((i) => i.status === "interested") || [];
  const notInterestedOfficers = interests?.filter((i) => i.status === "not_interested") || [];
  const availabilityOptions = useMemo(() => Array.from(new Set((interests || []).map((interest) => interest.officer_profiles?.availability_status).filter(Boolean))).sort(), [interests]);
  const filterOfficers = (entries: typeof interestedOfficers) => entries.filter((interest) => {
    const officer = interest.officer_profiles;
    const matchesSearch = !deferredSearchQuery || [officer?.profiles?.full_name, officer?.profiles?.email, officer?.title, officer?.location]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(deferredSearchQuery));
    return matchesSearch && (availabilityFilter === "all" || officer?.availability_status === availabilityFilter);
  });
  const filteredInterestedOfficers = filterOfficers(interestedOfficers);
  const filteredNotInterestedOfficers = filterOfficers(notInterestedOfficers);
  const hasActiveFilters = Boolean(searchQuery.trim()) || availabilityFilter !== "all";

  if (isLoading) {
    return <div>Loading interests...</div>;
  }

  return (
    <Tabs defaultValue="interested" className="w-full">
      <TabsList className="grid w-full grid-cols-2">
        <TabsTrigger value="interested">
          Interested ({interestedOfficers.length})
        </TabsTrigger>
        <TabsTrigger value="not_interested">
          Not Interested ({notInterestedOfficers.length})
        </TabsTrigger>
      </TabsList>

      {(interests?.length || 0) > 0 && <div className="mt-4 space-y-3 rounded-xl border bg-muted/20 p-3"><div className="flex flex-col gap-2 md:flex-row md:items-center"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search interested officers" className="bg-background pl-9" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search name, email, title, or location" /></div><Select value={availabilityFilter} onValueChange={setAvailabilityFilter}><SelectTrigger className="bg-background md:w-52" aria-label="Filter interested officers by availability"><SelectValue placeholder="All availability" /></SelectTrigger><SelectContent><SelectItem value="all">All availability</SelectItem>{availabilityOptions.map((availability) => <SelectItem key={availability} value={availability}>{String(availability).replace(/_/g, " ")}</SelectItem>)}</SelectContent></Select>{hasActiveFilters && <Button type="button" variant="ghost" size="sm" onClick={() => { setSearchQuery(""); setAvailabilityFilter("all"); }}><X className="mr-1.5 h-4 w-4" />Clear</Button>}</div></div>}

      <TabsContent value="interested" className="space-y-4">
        {filteredInterestedOfficers.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-center">{interestedOfficers.length ? "No interested officers match the selected filters" : "No officers marked as interested yet"}</p>
            </CardContent>
          </Card>
        ) : (
          filteredInterestedOfficers.map((interest) => (
            <Card key={interest.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    <ProfileAvatar name={interest.officer_profiles?.profiles?.full_name} email={interest.officer_profiles?.profiles?.email} src={interest.officer_profiles?.avatar_url} />
                    <div>
                    <CardTitle>{interest.officer_profiles?.profiles?.full_name}</CardTitle>
                    <CardDescription>{interest.officer_profiles?.title}</CardDescription>
                    </div>
                  </div>
                  <Badge variant="secondary">{interest.officer_profiles?.availability_status}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    <strong>Location:</strong> {interest.officer_profiles?.location || "Not specified"}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    <strong>Experience:</strong> {interest.officer_profiles?.years_experience || 0} years
                  </p>
                  <div className="flex flex-col gap-2 mt-4">
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={() =>
                          updateInterestMutation.mutate({ id: interest.id, status: "not_interested" })
                        }
                      >
                        Move to Not Interested
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => removeInterestMutation.mutate(interest.id)}
                      >
                        Remove
                      </Button>
                    </div>
                    {isFreeTier ? (
                      <Button variant="outline" disabled className="w-full">
                        <Lock className="w-4 h-4 mr-2" />
                        Send Interest Email (Premium Feature)
                      </Button>
                    ) : (
                      <>
                        <Button 
                          variant="default" 
                          className="w-full"
                          onClick={() => handleSendInterestEmail(interest.officer_profiles?.id)}
                        >
                          <Mail className="w-4 h-4 mr-2" />
                          Send Interest Email
                        </Button>
                        <Button 
                          variant="outline" 
                          className="w-full"
                          onClick={() => {
                            setSelectedOfficer({
                              id: interest.officer_profiles?.id,
                              name: interest.officer_profiles?.profiles?.full_name
                            });
                            setChatOpen(true);
                          }}
                        >
                          <MessageCircle className="w-4 h-4 mr-2" />
                          Chat with Officer
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </TabsContent>

      <TabsContent value="not_interested" className="space-y-4">
        {filteredNotInterestedOfficers.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-center">{notInterestedOfficers.length ? "No Not Interested officers match the selected filters" : "No officers marked as not interested"}</p>
            </CardContent>
          </Card>
        ) : (
          filteredNotInterestedOfficers.map((interest) => (
            <Card key={interest.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>{interest.officer_profiles?.profiles?.full_name}</CardTitle>
                    <CardDescription>{interest.officer_profiles?.title}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      updateInterestMutation.mutate({ id: interest.id, status: "interested" })
                    }
                  >
                    Move to Interested
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => removeInterestMutation.mutate(interest.id)}
                  >
                    Remove
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </TabsContent>
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
    </Tabs>
  );
}
