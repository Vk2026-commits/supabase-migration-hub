import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type Employee = { id: string; first_name: string; last_name: string; email: string | null; phone: string | null; hire_date: string | null; position_title: string | null; status: string };
export function EmployeeRecords({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setRows([]);
    (async () => {
      const { data, error } = await (supabase as any).from("company_employee_imports")
        .select("id,first_name,last_name,email,phone,hire_date,position_title,status")
        .eq("company_id", companyId).order("last_name").abortSignal(controller.signal);
      if (error) throw error;
      if (!controller.signal.aborted) setRows(data || []);
    })().catch(e => { if (!controller.signal.aborted) setError(e.message || "Could not load employees"); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [companyId, retry]);
  const filtered = rows.filter(r => `${r.first_name} ${r.last_name} ${r.email || ""} ${r.phone || ""}`.toLowerCase().includes(search.toLowerCase()));
  return <section className="rounded-xl border bg-background p-5 space-y-4">
    <div><h2 className="text-xl font-semibold">Employee records {!loading && `(${rows.length})`}</h2><p className="text-sm text-muted-foreground">Current employees imported for a records update.</p></div>
    <Input aria-label="Search employees" placeholder="Search name, email or phone" value={search} onChange={e => setSearch(e.target.value)} />
    {loading ? <p role="status">Loading employees…</p> : error ? <div role="alert">{error}<Button variant="outline" onClick={() => setRetry(n => n + 1)}>Retry</Button></div> : <>
      <p className="text-sm text-muted-foreground">{rows.filter(r => r.email).length} with email · {rows.filter(r => !r.email).length} need an email address · Invitations not sent</p>
      <div className="divide-y rounded-lg border">{filtered.map(row => <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0"><h3 className="font-semibold">{row.first_name} {row.last_name}</h3><p className="text-sm text-muted-foreground break-words">{row.email || "Email needed"}{row.phone ? ` · ${row.phone}` : ""}</p><p className="text-xs text-muted-foreground">{row.position_title || "Employee"}{row.hire_date ? ` · Hired ${row.hire_date}` : ""}</p></div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${row.email ? "bg-slate-100 text-slate-700" : "bg-amber-50 text-amber-800"}`}>{row.email ? "Setup pending" : "Email needed"}</span>
      </div>)}{!filtered.length && <p className="p-4 text-muted-foreground">No employees found.</p>}</div>
    </>}
  </section>;
}
