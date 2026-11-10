import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type Employee = { id: string; first_name: string; last_name: string; email: string | null; phone: string | null; hire_date: string | null; proposed_hire_date: string | null; position_title: string | null; status: string; invitation_excluded: boolean };
export function EmployeeRecords({ companyId, canManage = false }: { companyId: string; canManage?: boolean }) {
  const [rows, setRows] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [matches, setMatches] = useState<Record<string,string>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<string[]>([]);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setRows([]); setMatches({}); setSelected([]); setPreview([]);
    (async () => {
      const [roster, accountMatches] = await Promise.all([(supabase as any).from("company_employee_imports")
        .select("id,first_name,last_name,email,phone,hire_date,proposed_hire_date,position_title,status,invitation_excluded")
        .eq("company_id", companyId).order("last_name").abortSignal(controller.signal),
        (supabase as any).rpc("employee_account_matches", { _company_id: companyId }).abortSignal(controller.signal)]);
      if (roster.error) throw roster.error;
      if (accountMatches.error) throw accountMatches.error;
      if (!controller.signal.aborted) {
        setRows(roster.data || []);
        setMatches(Object.fromEntries((accountMatches.data || []).map((m: {employee_id:string;match_status:string}) => [m.employee_id,m.match_status])));
      }
    })().catch(e => { if (!controller.signal.aborted) setError(e.message || "Could not load employees"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [companyId, retry]);
  const reviewHireDate = async (row: Employee, approve: boolean) => {
    if (reviewing) return;
    setReviewing(row.id); setError("");
    try {
      const { error: reviewError } = await (supabase as any).rpc("review_employee_hire_date", {
        _employee_id: row.id, _expected_date: row.proposed_hire_date, _approve: approve,
      }).abortSignal(AbortSignal.timeout(15000));
      if (reviewError) throw reviewError;
      setRetry(n => n + 1);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not review hire date"); }
    finally { setReviewing(null); }
  };
  const filtered = rows.filter(r => `${r.first_name} ${r.last_name} ${r.email || ""} ${r.phone || ""}`.toLowerCase().includes(search.toLowerCase()));
  const labels: Record<string,string> = { missing_email: "No email — excluded", new_account: "New account needed", verification_required: "Email verification needed", account_review_required: "Existing account — review needed", existing_officer_account: "Existing officer account" };
  const eligible = rows.filter(r => !r.invitation_excluded && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email || "") && matches[r.id] !== "account_review_required" && !["claimed", "complete"].includes(r.status));
  const eligibleIds = new Set(eligible.map(r => r.id));
  return <section className="rounded-xl border bg-background p-5 space-y-4">
    <div><h2 className="text-xl font-semibold">Employee records {!loading && `(${rows.length})`}</h2><p className="text-sm text-muted-foreground">Current employees imported for a records update.</p></div>
    {canManage && <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={!eligible.length} onClick={() => setSelected(selected.length === eligible.length ? [] : eligible.map(r => r.id))}>{selected.length === eligible.length && eligible.length ? "Clear selection" : "Select eligible employees"}</Button>
      <Button disabled={!selected.length} onClick={() => setPreview(selected)}>Preview invitations ({selected.length})</Button>
    </div>}
    <Input aria-label="Search employees" placeholder="Search name, email or phone" value={search} onChange={e => setSearch(e.target.value)} />
    {loading ? <p role="status">Loading employees…</p> : error ? <div role="alert">{error}<Button variant="outline" onClick={() => setRetry(n => n + 1)}>Retry</Button></div> : <>
      <p className="text-sm text-muted-foreground">{eligible.length} eligible · {rows.filter(r => r.invitation_excluded).length} excluded · Invitations not sent</p>
      <div className="divide-y rounded-lg border">{filtered.map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
        {canManage && <input type="checkbox" aria-label={`Select ${row.first_name} ${row.last_name}`} disabled={!eligibleIds.has(row.id)} checked={selected.includes(row.id)} onChange={e => setSelected(ids => e.target.checked ? [...ids, row.id] : ids.filter(id => id !== row.id))} />}
        <div className="min-w-0 flex-1"><h3 className="font-semibold">{row.first_name} {row.last_name}</h3><p className="text-sm text-muted-foreground break-words">{row.email || "Email needed"}{row.phone ? ` · ${row.phone}` : ""}</p><p className="text-xs text-muted-foreground">{row.position_title || "Employee"}{row.hire_date ? ` · Hired ${row.hire_date}` : ""}</p></div>
        {!row.hire_date && row.proposed_hire_date && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
          <p>Proposed hire date: <strong>{row.proposed_hire_date}</strong></p>
          {canManage ? <div className="mt-2 flex gap-2">
            <Button size="sm" disabled={Boolean(reviewing)} onClick={() => reviewHireDate(row, true)}>Confirm hire date</Button>
            <Button size="sm" variant="outline" disabled={Boolean(reviewing)} onClick={() => reviewHireDate(row, false)}>Request correction</Button>
          </div> : <p>Awaiting staff review</p>}
        </div>}
        <span className="text-xs text-muted-foreground">{row.invitation_excluded ? "Excluded from invitations" : labels[matches[row.id]] || "Match unavailable"}</span>
        {canManage && <Button variant="outline" disabled={!eligibleIds.has(row.id)} onClick={() => setPreview([row.id])}>Preview invitation</Button>}
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${row.email ? "bg-slate-100 text-slate-700" : "bg-amber-50 text-amber-800"}`}>{row.invitation_excluded ? "Excluded" : row.status === "complete" ? "Complete" : row.status === "claimed" ? "In progress" : row.status === "invited" ? "Invited" : "Setup pending"}</span>
      </div>)}{!filtered.length && <p className="p-4 text-muted-foreground">No employees found.</p>}</div>
    </>}
    <Dialog open={preview.length > 0} onOpenChange={open => { if (!open) setPreview([]); }}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Employee invitation preview</DialogTitle><DialogDescription>{preview.length} employee{preview.length === 1 ? "" : "s"} selected. No emails have been sent.</DialogDescription></DialogHeader>
        <div className="rounded-lg border p-4 space-y-3 text-sm">
          <p className="font-semibold">Kairos Security: update your employee records</p>
          <p>Kairos Security is updating employee records through We Find Guards. Please create an officer account, or sign in to your existing account, using this email address.</p>
          <p>Review and update your profile, employment application, and onboarding forms. You will need to complete any missing information and sign your own forms. This is a records update for your current employment.</p>
          <p className="font-medium text-primary">Open your secure employee setup link</p>
        </div>
        <details className="text-sm"><summary className="cursor-pointer">View selected recipients</summary><ul className="mt-2 space-y-1">{rows.filter(r => preview.includes(r.id)).map(r => <li key={r.id}>{r.first_name} {r.last_name} · {r.email}</li>)}</ul></details>
        <p className="text-sm text-amber-800">Preview only. Sending will be enabled after the employee records-update flow is verified.</p>
        <Button variant="outline" onClick={() => setPreview([])}>Close preview</Button>
      </DialogContent>
    </Dialog>
  </section>;
}
