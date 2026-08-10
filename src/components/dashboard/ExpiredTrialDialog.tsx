import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Crown, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ExpiredTrialDialogProps {
  open: boolean;
  companyName: string;
  companyPhone: string;
  email: string;
  onUpgrade: () => void;
}

const ExpiredTrialDialog = ({ open, companyName, companyPhone, email, onUpgrade }: ExpiredTrialDialogProps) => {
  const [loading, setLoading] = useState(false);

  const handleUpgrade = async (tier: "professional" | "premium") => {
    setLoading(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/upgrade-subscription`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
        body: JSON.stringify({ tier }),
      });

      if (!response.ok) throw new Error('Upgrade failed');
      
      const data = await response.json();
      toast.success(data.message || "Successfully upgraded!");
      onUpgrade();
    } catch (error) {
      toast.error("Failed to upgrade subscription. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle className="text-2xl">Welcome Back, {companyName}!</DialogTitle>
          <DialogDescription className="text-base">
            We thank you for returning, but your free membership has expired. Please choose a flexible access plan to continue.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="bg-muted/50 p-4 rounded-lg">
            <p className="text-sm text-muted-foreground">
              <strong>Company:</strong> {companyName}<br />
              <strong>Phone:</strong> {companyPhone}<br />
              <strong>Email:</strong> {email}
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 mt-6">
            <Card className="border-2 border-primary relative">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <span className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
                  Popular
                </span>
              </div>
              
              <CardHeader>
                <div className="flex items-center justify-between mb-2">
                  <CardTitle className="text-xl">Professional</CardTitle>
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div className="mb-2">
                  <span className="text-4xl font-bold">$19.99</span>
                  <span className="text-muted-foreground ml-2">per month</span>
                </div>
                <CardDescription>Full access to professional features</CardDescription>
              </CardHeader>

              <CardContent>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Full officer names</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Direct messaging</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Email contact access</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Job posting management</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Advanced search filters</span>
                  </li>
                </ul>

                <Button 
                  className="w-full" 
                  onClick={() => handleUpgrade("professional")}
                  disabled={loading}
                >
                  {loading ? "Processing..." : "Select Professional"}
                </Button>
              </CardContent>
            </Card>

            <Card className="border-2">
              <CardHeader>
                <div className="flex items-center justify-between mb-2">
                  <CardTitle className="text-xl">Premium</CardTitle>
                  <Crown className="h-5 w-5 text-primary" />
                </div>
                <div className="mb-2">
                  <span className="text-4xl font-bold">$29.99</span>
                  <span className="text-muted-foreground ml-2">per month</span>
                </div>
                <CardDescription>Complete access to all features</CardDescription>
              </CardHeader>

              <CardContent>
                <ul className="space-y-3 mb-6">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Everything in Professional</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Full certification access</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Video interview viewing</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Work history details</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Priority support</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                    <span className="text-sm">Advanced analytics</span>
                  </li>
                </ul>

                <Button 
                  className="w-full" 
                  variant="outline"
                  onClick={() => handleUpgrade("premium")}
                  disabled={loading}
                >
                  {loading ? "Processing..." : "Select Premium"}
                </Button>
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-center text-muted-foreground mt-4">
            Choose a plan above to continue accessing your dashboard and all features.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExpiredTrialDialog;
