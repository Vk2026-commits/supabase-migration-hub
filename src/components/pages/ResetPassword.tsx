import { useState, useEffect } from "react";
import { useNavigate } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Shield } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";

const passwordSchema = z.string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Z]/, "Password must contain at least one capital letter")
  .regex(/[0-9]/, "Password must contain at least one number")
  .regex(/[^A-Za-z0-9]/, "Password must contain at least one special symbol");

const ResetPassword = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // If recovery token is present in the URL hash, we're good
    const hash = window.location.hash || "";
    if (hash.includes("access_token") || hash.includes("type=recovery") || hash.includes("type=signup")) {
      setReady(true);
    }

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || session) {
        setReady(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });

    // Fallback: after 2s, allow the form anyway so user can attempt update
    const t = setTimeout(() => setReady(true), 2000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      passwordSchema.parse(password);
    } catch (err) {
      if (err instanceof z.ZodError) {
        toast.error(err.errors[0].message);
        return;
      }
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Password updated! Redirecting...");
    setTimeout(() => navigate("/dashboard"), 1000);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <div className="flex items-center justify-center mb-4">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <CardTitle className="text-2xl text-center">Set a new password</CardTitle>
          <CardDescription className="text-center">
            Choose a strong password for your account
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!ready ? (
            <p className="text-center text-sm text-muted-foreground">
              Verifying reset link... If this persists, request a new reset email.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <Input id="password" type="password" value={password}
                  onChange={(e) => setPassword(e.target.value)} required />
                <ul className="list-disc list-inside text-xs text-muted-foreground space-y-0.5">
                  <li className={password.length >= 8 ? "text-green-600" : ""}>At least 8 characters</li>
                  <li className={/[A-Z]/.test(password) ? "text-green-600" : ""}>One capital letter</li>
                  <li className={/[0-9]/.test(password) ? "text-green-600" : ""}>One number</li>
                  <li className={/[^A-Za-z0-9]/.test(password) ? "text-green-600" : ""}>One special symbol</li>
                </ul>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm Password</Label>
                <Input id="confirm" type="password" value={confirm}
                  onChange={(e) => setConfirm(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Updating..." : "Update Password"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ResetPassword;
