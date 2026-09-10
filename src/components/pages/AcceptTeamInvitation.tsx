import { useEffect, useState } from "react";
import { Link, useNavigate } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type InvitationState = "verifying" | "invalid";

const AcceptTeamInvitation = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<InvitationState>("verifying");

  useEffect(() => {
    const acceptInvitation = async () => {
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get("token_hash");
      const type = params.get("type");

      if (!tokenHash || type !== "invite") {
        setState("invalid");
        return;
      }

      const {
        data: { user },
        error,
      } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: "invite" });
      const companyId = user?.user_metadata?.company_team_invite;
      if (error || typeof companyId !== "string" || !companyId) {
        setState("invalid");
        return;
      }

      const acceptance = await supabase.functions.invoke("manage-company-team", {
        body: { action: "accept_invitation", company_id: companyId },
      });
      if (acceptance.error || acceptance.data?.error) {
        setState("invalid");
        return;
      }

      navigate("/reset-password?invite=company-team", { replace: true });
    };

    void acceptInvitation();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3 text-center">
          <div className="flex items-center justify-center">
            <Link to="/" className="flex items-center gap-2" aria-label="We Find Guards home">
              <Shield className="h-8 w-8 text-primary" />
              <span className="text-2xl font-bold bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-transparent">
                We Find Guards
              </span>
            </Link>
          </div>
          <CardTitle className="text-2xl">
            {state === "verifying"
              ? "Setting up your access"
              : "This invitation link is unavailable"}
          </CardTitle>
          <CardDescription className="text-base">
            {state === "verifying"
              ? "Please wait while we securely verify your team invitation."
              : "This invitation link is invalid, expired, or has already been used."}
          </CardDescription>
        </CardHeader>
        {state === "invalid" && (
          <CardContent className="space-y-4 text-center">
            <p className="text-sm text-muted-foreground">
              Ask your company administrator to send you a new team invitation, then use the newest
              link in your email.
            </p>
            <Button asChild variant="outline">
              <Link to="/auth">Go to sign in</Link>
            </Button>
          </CardContent>
        )}
      </Card>
    </div>
  );
};

export default AcceptTeamInvitation;
