import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Lock, Mail, MessageCircle } from "lucide-react";
import { ChatDialog } from "./ChatDialog";

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

      <TabsContent value="interested" className="space-y-4">
        {interestedOfficers.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-center">No officers marked as interested yet</p>
            </CardContent>
          </Card>
        ) : (
          interestedOfficers.map((interest) => (
            <Card key={interest.id}>
              <CardHeader>
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle>{interest.officer_profiles?.profiles?.full_name}</CardTitle>
                    <CardDescription>{interest.officer_profiles?.title}</CardDescription>
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
        {notInterestedOfficers.length === 0 ? (
          <Card>
            <CardContent className="pt-6">
              <p className="text-muted-foreground text-center">No officers marked as not interested</p>
            </CardContent>
          </Card>
        ) : (
          notInterestedOfficers.map((interest) => (
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
