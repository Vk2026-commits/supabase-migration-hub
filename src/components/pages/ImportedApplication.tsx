import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";
import { LegacyAnswer } from "@/components/dashboard/LegacyApplicants";
import { mapLegacyApplication } from "@/lib/legacyApplication";
export default function ImportedApplication() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [info, setInfo] = useState<any>(null);
  const [error, setError] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setInfo(null);
    setError("");
    (async () => {
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (!active) return;
      setSignedIn(Boolean(data.session));
      if (!data.session) return;
      const { data: result, error: claimError } = await (supabase as any)
        .rpc("claim_legacy_invitation", { _token: token, _apply: false })
        .abortSignal(AbortSignal.timeout(15000));
      if (claimError) throw claimError;
      if (active) setInfo(result);
    })()
      .catch((e) => {
        if (active) setError(e.message || "Unable to load invitation");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, retry]);
  const next = `/imported-application?token=${encodeURIComponent(token)}`;
  const auth = (mode: string) =>
    `/auth?role=officer&mode=${mode}&force=1&next=${encodeURIComponent(next)}`;
  const accept = async () => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { data, error } = await (supabase as any)
        .rpc("claim_legacy_invitation", {
          _token: token,
          _apply: true,
          _prefill: mapLegacyApplication(info.legacy),
        })
        .abortSignal(AbortSignal.timeout(15000));
      if (error) throw error;
      window.location.assign(
        `/dashboard?viewAs=officer&onboarding=application&job=${encodeURIComponent(data.job_id)}${data.existing_application ? "" : "&legacyReview=1"}`,
      );
    } catch (e: any) {
      setError(e.message || "Could not open your application");
      setBusy(false);
    }
  };
  return (
    <main className="mx-auto max-w-3xl p-5 sm:p-10">
      <h1 className="text-2xl font-bold">Continue your saved application</h1>
      <p className="my-4 text-muted-foreground">
        Create an officer account or sign in using the email that received your invitation. Your
        saved answers are available only after email verification.
      </p>
      {loading ? (
        <p>Checking invitation…</p>
      ) : !signedIn ? (
        <div className="flex gap-3">
          <Button asChild>
            <a href={auth("signup")}>Create officer account</a>
          </Button>
          <Button asChild variant="outline">
            <a href={auth("signin")}>Sign in</a>
          </Button>
        </div>
      ) : null}
      {error && (
        <div role="alert" className="my-4 rounded border border-amber-300 p-4">
          <p>{error}</p>
          <div className="mt-3 flex gap-3">
            <Button variant="outline" onClick={() => setRetry((n) => n + 1)}>
              Retry
            </Button>
            <Button asChild variant="outline">
              <a href={auth("signin")}>Sign in with another account</a>
            </Button>
          </div>
        </div>
      )}
      {info && (
        <section className="space-y-4 rounded-xl border p-5">
          <h2 className="text-xl font-semibold">
            {info.company_name} · {info.legacy.applicant_name}
          </h2>
          <p>
            Original application:{" "}
            {new Date(info.legacy.source_submitted_at).toLocaleString("en-US", {
              timeZone: "America/Chicago",
            })}{" "}
            (Central)
          </p>
          <p>
            {info.existing_application
              ? "You already have an application for this job. Continue with your existing progress."
              : "Review your imported information below. Continue to fill missing fields in your draft without replacing answers you already saved. A previously submitted application is preserved. Review each section, update anything that has changed, and provide a fresh signature before confirming."}
          </p>
          <Button disabled={busy} onClick={accept}>
            {busy
              ? "Opening…"
              : info.existing_application || info.claimed
                ? "Continue application"
                : "Use saved answers and review application"}
          </Button>
          <details className="rounded border p-4">
            <summary className="cursor-pointer font-medium">Review imported answers</summary>
            <div className="mt-4">
              <LegacyAnswer value={mapLegacyApplication(info.legacy)} />
            </div>
          </details>
          <p className="text-sm text-muted-foreground">
            This step does not submit or sign your application. Historical signatures and
            acknowledgments will not be reused. Social Security information belongs in secure
            onboarding.
          </p>
        </section>
      )}
    </main>
  );
}
