import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Crown, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface SubscriptionManagerProps {
  currentTier: string;
  onUpgrade: (tier: string) => void;
}

const SubscriptionManager = ({ currentTier, onUpgrade }: SubscriptionManagerProps) => {
  const handleUpgrade = async (tier: string) => {
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
      toast.success(data.message || "Successfully upgraded! Your trial has started.");
      onUpgrade(tier);
    } catch (error) {
      toast.error("Failed to upgrade subscription. Please try again.");
    }
  };

  const tiers = [
    {
      name: "Free",
      value: "free",
      price: "$0",
      description: "Basic browsing",
      features: [
        "View officer profiles",
        "Basic information access",
        "Search functionality",
        "Limited name visibility",
      ],
    },
    {
      name: "Professional",
      value: "professional",
      price: "$19.99",
      period: "per month",
      trial: "30-day free trial",
      icon: Users,
      popular: true,
      features: [
        "Everything in Free",
        "Full officer names",
        "Direct messaging",
        "Email contact access",
        "Advanced search filters",
        "Job posting management",
      ],
    },
    {
      name: "Premium",
      value: "premium",
      price: "$29.99",
      period: "per month",
      icon: Crown,
      features: [
        "Everything in Professional",
        "Full certification access",
        "Video interview viewing",
        "Work history details",
        "Priority support",
        "Unlimited job postings",
        "Advanced analytics",
      ],
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Subscription Plans</h2>
        <p className="text-muted-foreground">
          Choose the plan that best fits your hiring needs
        </p>
      </div>

      <div className="grid md:grid-cols-3 gap-6">
        {tiers.map((tier) => {
          const Icon = tier.icon;
          const isCurrentTier = currentTier === tier.value;
          const canUpgrade = 
            (currentTier === "free" && tier.value !== "free") ||
            (currentTier === "professional" && tier.value === "premium");

          return (
            <Card
              key={tier.value}
              className={`relative ${
                tier.popular ? "border-2 border-primary" : ""
              } ${isCurrentTier ? "ring-2 ring-primary" : ""}`}
            >
              {tier.popular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <span className="bg-primary text-primary-foreground text-xs font-medium px-3 py-1 rounded-full">
                    Popular
                  </span>
                </div>
              )}
              
              <CardHeader>
                <div className="flex items-center justify-between mb-2">
                  <CardTitle className="text-xl">{tier.name}</CardTitle>
                  {Icon && <Icon className="h-5 w-5 text-primary" />}
                </div>
                <div className="mb-2">
                  <span className="text-4xl font-bold">{tier.price}</span>
                  {tier.period && (
                    <span className="text-muted-foreground ml-2">{tier.period}</span>
                  )}
                  {tier.trial && (
                    <div className="text-sm text-primary font-medium mt-1">{tier.trial}</div>
                  )}
                </div>
                <CardDescription>{tier.description}</CardDescription>
              </CardHeader>

              <CardContent>
                <ul className="space-y-3 mb-6">
                  {tier.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                      <span className="text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                {isCurrentTier ? (
                  <Button className="w-full" variant="outline" disabled>
                    Current Plan
                  </Button>
                ) : canUpgrade ? (
                  <Button
                    className="w-full"
                    onClick={() => handleUpgrade(tier.value)}
                    variant={tier.popular ? "default" : "outline"}
                  >
                    Upgrade to {tier.name}
                  </Button>
                ) : (
                  <Button className="w-full" variant="ghost" disabled>
                    {tier.value === "free" ? "Downgrade" : "Not Available"}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Need Help?</CardTitle>
          <CardDescription>
            Have questions about our plans or need a custom solution?
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            Contact our sales team for enterprise pricing, custom features, or if you have any questions about which plan is right for you.
          </p>
          <Button variant="outline">Contact Sales</Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default SubscriptionManager;
