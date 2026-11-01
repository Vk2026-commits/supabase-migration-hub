import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type TestAccount = {
  user_id: string; active_run_id: string; outcome: string | null;
  history: { id: string; outcome: string; finished_at: string }[];
};

export function HiringTestPanel({ userId, companyId }: { userId?: string; companyId?: string }) {
  const [account, setAccount] = useState<TestAccount | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!userId && !companyId) return;
    const result = await (supabase as any).rpc("get_hiring_test_account", {
      _user_id: userId || null, _company_id: companyId || null,
    });
    if (result.error) throw result.error;
    return result.data as TestAccount | null;
  }, [userId, companyId]);
  useEffect(() => {
    let active = true;
    const refresh = () => { void load().then(data => { if (active) setAccount(data || null); }).catch(() => {}); };
    refresh();
    const interval = window.setInterval(refresh, 10000);
    window.addEventListener("focus", refresh);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener("focus", refresh); };
  }, [load]);

  const exit = async (outcome: string) => {
    if (!account || busy) return;
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("record_hiring_test_exit", {
        _user_id: account.user_id, _expected_run_id: account.active_run_id, _outcome: outcome,
      });
      if (error) throw error;
      setAccount(await load() || null);
    } catch (error: any) { toast.error(error.message || "Could not record test outcome"); }
    finally { setBusy(false); }
  };
  const reset = async () => {
    if (!account || busy) return;
    setBusy(true);
    try {
      const { error } = await (supabase as any).rpc("reset_hiring_test", {
        _user_id: account.user_id, _expected_run_id: account.active_run_id,
      });
      if (error) throw error;
      // Drop only this test officer's navigation and receipt hints, never auth storage.
      for (const key of Object.keys(localStorage)) {
        if ((key.startsWith("guard-application-") || key.startsWith("hiring-submission-attempt:")) && key.includes(account.user_id)) localStorage.removeItem(key);
      }
      window.location.assign(userId ? "/dashboard?onboarding=application" : "/dashboard?tab=applicants");
    } catch (error: any) { toast.error(error.message || "Reset failed; the current run was preserved"); setBusy(false); }
  };
  if (!account) return null;
  return <section aria-label="Kairos test applicant" className="m-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-slate-900">
    <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">TEST ACCOUNT</Badge><strong>Kairos Test Officer</strong><span>Run {account.active_run_id.slice(0, 8)}</span></div>
    <p className="mt-2">Synthetic data only. Forms are prefilled; review, sign, and submit each step yourself. External notification emails are suppressed.</p>
    {account.outcome ? <div className="mt-3 flex flex-wrap items-center gap-3"><strong>Result: {account.outcome}</strong><Button disabled={busy} onClick={() => void reset()}>{busy ? "Starting…" : "Start next test"}</Button><span>Preserves this run in test history.</span></div>
      : <div className="mt-3 flex flex-wrap gap-2"><span className="self-center">Continue the normal hiring steps, or record a test-only exit:</span><Button size="sm" variant="outline" disabled={busy} onClick={() => void exit("Archived")}>Archive test applicant</Button><Button size="sm" variant="outline" disabled={busy} onClick={() => void exit("Unable to verify work")}>Unable to verify work</Button></div>}
    {account.history.length > 0 ? <details className="mt-3"><summary className="cursor-pointer">Previous test results ({account.history.length})</summary><ul className="mt-2 space-y-1">{account.history.map(run => <li key={run.id}>{run.outcome} — {new Date(run.finished_at).toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" })} Central</li>)}</ul></details> : null}
  </section>;
}
