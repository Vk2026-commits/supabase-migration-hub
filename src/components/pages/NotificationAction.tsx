import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "@/lib/router-compat";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, LoaderCircle, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const messageFromError = async (error: unknown) => {
  const context =
    error && typeof error === "object" && "context" in error
      ? (error as { context?: unknown }).context
      : null;
  if (context && typeof context.clone === "function") {
    try {
      const payload = await context.clone().json();
      if (payload?.error) return String(payload.error);
    } catch {
      // Fall back to the generic message when the response is not JSON.
    }
  }
  return error instanceof Error ? error.message : "This secure link could not be opened.";
};

export default function NotificationAction() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [message, setMessage] = useState("Verifying your secure link…");
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    const token = searchParams.get("token") || "";

    const openAction = async () => {
      if (token.length < 32) {
        if (active)
          setError(
            "This secure link is invalid. Please use the most recent email from We Find Guards.",
          );
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        const next = `/notification-action?token=${encodeURIComponent(token)}`;
        navigate(`/auth?next=${encodeURIComponent(next)}`, { replace: true });
        return;
      }

      try {
        setMessage("Opening your account…");
        const { data, error: resolveError } = await supabase.functions.invoke(
          "send-workflow-notifications",
          { body: { action: "resolve", token } },
        );
        if (resolveError) throw resolveError;
        if (data?.error || !data?.destination) {
          throw new Error(data?.error || "This secure link could not be opened.");
        }
        if (active) navigate(data.destination, { replace: true });
      } catch (resolveError) {
        if (active) setError(await messageFromError(resolveError));
      }
    };

    void openAction();
    return () => {
      active = false;
    };
  }, [navigate, searchParams]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted/30 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3 text-center">
          <Link to="/" className="mx-auto flex w-fit items-center gap-2">
            <Shield className="h-8 w-8 text-primary" />
            <span className="bg-gradient-to-r from-primary to-primary/70 bg-clip-text text-2xl font-bold text-transparent">
              We Find Guards
            </span>
          </Link>
          {error ? (
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-7 w-7 text-destructive" />
            </div>
          ) : (
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <LoaderCircle className="h-7 w-7 animate-spin text-primary" />
            </div>
          )}
          <CardTitle className="text-2xl">
            {error ? "Link unavailable" : "Opening your account"}
          </CardTitle>
          <CardDescription className="text-base">{error || message}</CardDescription>
        </CardHeader>
        {error && (
          <CardContent className="flex justify-center">
            <Button asChild>
              <Link to="/auth">Go to sign in</Link>
            </Button>
          </CardContent>
        )}
      </Card>
    </main>
  );
}
