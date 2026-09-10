import { useEffect, useState } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const phoneIsValid = (value: string) => value.replace(/\D/g, "").length >= 7;

const CompleteTeamProfile = () => {
  const navigate = useNavigate();
  const [companyId, setCompanyId] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [jobTitle, setJobTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const loadProfile = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const inviteCompanyId = user?.user_metadata?.company_team_invite;
      if (!user || typeof inviteCompanyId !== "string" || !inviteCompanyId) {
        navigate("/auth", { replace: true });
        return;
      }

      const [{ data: profile, error: profileError }, { data: membership, error: membershipError }] =
        await Promise.all([
          supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
          supabase
            .from("company_members")
            .select("status,password_created_at,phone,job_title")
            .eq("company_id", inviteCompanyId)
            .eq("user_id", user.id)
            .maybeSingle(),
        ]);

      if (profileError || membershipError || !membership) {
        toast.error(
          "Your team profile could not be loaded. Ask the team administrator for a new invitation.",
        );
        navigate("/auth", { replace: true });
        return;
      }
      if (membership.status === "active") {
        navigate("/browse", { replace: true });
        return;
      }
      if (membership.status !== "accepted" || !membership.password_created_at) {
        navigate("/reset-password?invite=company-team", { replace: true });
        return;
      }

      setCompanyId(inviteCompanyId);
      setFullName(profile?.full_name || "");
      setPhone(membership.phone || "");
      setJobTitle(membership.job_title || "");
      setLoading(false);
    };

    void loadProfile();
  }, [navigate]);

  const completeProfile = async (event: React.FormEvent) => {
    event.preventDefault();
    if (fullName.trim().length < 2) {
      toast.error("Enter your full name");
      return;
    }
    if (!phoneIsValid(phone)) {
      toast.error("Enter a valid mobile phone number");
      return;
    }

    setSubmitting(true);
    const result = await supabase.functions.invoke("manage-company-team", {
      body: {
        action: "complete_invitation_profile",
        company_id: companyId,
        full_name: fullName.trim(),
        phone: phone.trim(),
        job_title: jobTitle.trim(),
      },
    });
    setSubmitting(false);

    if (result.error || result.data?.error) {
      toast.error(result.data?.error || result.error?.message || "Your profile could not be saved");
      return;
    }

    toast.success("Your account is ready. Welcome to We Find Guards!");
    navigate("/browse", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-3 text-center">
          <div className="flex items-center justify-center">
            <Link to="/" className="flex items-center gap-2" aria-label="We Find Guards home">
              <Shield className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                We Find Guards
              </span>
            </Link>
          </div>
          <CardTitle className="text-2xl">Complete your team profile</CardTitle>
          <CardDescription className="text-base">
            Share your contact details so your company team knows who has access to its workspace.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Preparing your profile…
            </p>
          ) : (
            <form onSubmit={completeProfile} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="team-full-name">Full name *</Label>
                <Input
                  id="team-full-name"
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  placeholder="Jordan Smith"
                  autoComplete="name"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="team-phone">Mobile phone number *</Label>
                <Input
                  id="team-phone"
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="(555) 123-4567"
                  autoComplete="tel"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="team-job-title">Job title</Label>
                <Input
                  id="team-job-title"
                  value={jobTitle}
                  onChange={(event) => setJobTitle(event.target.value)}
                  placeholder="Operations Manager"
                  autoComplete="organization-title"
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? "Saving…" : "Finish setup and browse guards"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default CompleteTeamProfile;
