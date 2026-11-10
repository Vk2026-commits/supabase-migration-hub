import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useSearchParams } from "@/lib/router-compat";
import { Button } from "@/components/ui/button";

type EmployeeSetupInfo = {
  employee_id: string; company_id: string; company_name: string;
  first_name: string; last_name: string; phone: string | null;
  position: string | null; hire_date: string | null; proposed_hire_date: string | null;
  claimed: boolean; has_officer_profile: boolean;
};

export default function EmployeeSetup() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [info, setInfo] = useState<EmployeeSetupInfo | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [proposedDate, setProposedDate] = useState("");
  const next = `/employee-setup?token=${encodeURIComponent(token)}`;
  const auth = (mode: "signup" | "signin") =>
    `/auth?role=officer&mode=${mode}&force=1&next=${encodeURIComponent(next)}`;

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setInfo(null); setError("");
    (async () => {
      if (!token) throw new Error("Open the secure link in your employee invitation.");
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      if (controller.signal.aborted) return;
      setSignedIn(Boolean(data.session));
      if (!data.session) return;
      const { data: result, error: claimError } = await (supabase as any)
        .rpc("claim_employee_invitation", { _token: token, _apply: false })
        .abortSignal(AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]));
      if (claimError) throw claimError;
      if (!controller.signal.aborted) setInfo(result);
    })().catch(e => {
      if (!controller.signal.aborted) setError(e.message || "Could not load your invitation.");
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [token, retry]);

  const connect = async () => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const { data, error: claimError } = await (supabase as any)
        .rpc("claim_employee_invitation", { _token: token, _apply: true })
        .abortSignal(AbortSignal.timeout(15000));
      if (claimError) throw claimError;
      setInfo(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect your employee record.");
    } finally { setBusy(false); }
  };

  const saveHireDate = async () => {
    if (!info || busy || !proposedDate) return;
    setBusy(true); setError("");
    try {
      const { error: saveError } = await (supabase as any).rpc("propose_employee_hire_date", {
        _employee_id: info.employee_id, _hire_date: proposedDate,
      }).abortSignal(AbortSignal.timeout(15000));
      if (saveError) throw saveError;
      setInfo({ ...info, proposed_hire_date: proposedDate });
    } catch (e) { setError(e instanceof Error ? e.message : "Could not save your proposed hire date."); }
    finally { setBusy(false); }
  };

  return <main className="mx-auto max-w-2xl space-y-5 p-5 sm:p-10">
    <h1 className="text-2xl font-bold">Update your employee records</h1>
    <p className="text-muted-foreground">Use the email address that received your invitation. Verify your email to view your saved employee information.</p>
    {loading && <p role="status">Checking invitation…</p>}
    {!loading && !signedIn && token && <div className="flex flex-wrap gap-3">
      <Button asChild><a href={auth("signup")}>Create officer account</a></Button>
      <Button asChild variant="outline"><a href={auth("signin")}>Sign in</a></Button>
    </div>}
    {error && <div role="alert" className="space-y-3 rounded-lg border border-amber-300 p-4">
      <p>{error}</p><div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => setRetry(n => n + 1)}>Retry</Button>
        <Button asChild variant="outline"><a href={auth("signin")}>Sign in with another account</a></Button>
      </div>
    </div>}
    {info && <section className="space-y-4 rounded-xl border p-5">
      <div><h2 className="text-xl font-semibold">{info.first_name} {info.last_name}</h2><p className="text-muted-foreground">{info.company_name}</p></div>
      <dl className="grid gap-4 sm:grid-cols-2">
        <div><dt className="text-sm text-muted-foreground">Position</dt><dd>{info.position || "Not provided"}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Original hire date</dt><dd>{info.hire_date || "Needs company confirmation"}</dd></div>
      </dl>
      {info.claimed && !info.hire_date && <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
        <label htmlFor="original-hire-date" className="block font-medium">When did you originally start with {info.company_name}?</label>
        <input id="original-hire-date" type="date" value={proposedDate || info.proposed_hire_date || ""} onChange={e => setProposedDate(e.target.value)} className="rounded-md border bg-white p-2" />
        <p className="text-sm">Kairos staff will review this date before it becomes your official hire date.</p>
        {info.proposed_hire_date && <p role="status" className="text-sm font-medium">Awaiting staff review: {info.proposed_hire_date}</p>}
        <Button disabled={busy || !proposedDate} onClick={saveHireDate}>{busy ? "Saving…" : "Send date for review"}</Button>
      </div>}
      {info.claimed ? <><p role="status" className="text-green-700">Your employee record is connected.</p>
        <Button asChild><a href="/dashboard?viewAs=officer&tab=profile">Review officer profile</a></Button></>
        : <><p>Connect this record to your officer account. Your existing profile and saved forms will be preserved.</p>
        <Button disabled={busy || !info.has_officer_profile} onClick={connect}>{busy ? "Connecting…" : "Connect my employee record"}</Button>
        {!info.has_officer_profile && <p className="text-sm text-amber-800">This account needs an officer profile. Contact your company before continuing.</p>}</>}
    </section>}
  </main>;
}
