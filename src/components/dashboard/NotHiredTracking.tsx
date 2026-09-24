import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ArchiveX, CalendarX2, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ProfileAvatar } from "./ProfileAvatar";

type Props = { companyId: string };

export default function NotHiredTracking({ companyId }: Props) {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [reasonFilter, setReasonFilter] = useState("all");
  const deferredSearchQuery = useDeferredValue(searchQuery.trim().toLowerCase());

  useEffect(() => {
    const load = async () => {
      const { data, error } = await (supabase as any)
        .from("hires")
        .select("*,officer_profiles(*,profiles(full_name,email,avatar_url)),hire_screening_checks(*)")
        .eq("company_id", companyId)
        .eq("status", "not_hired")
        .order("rejected_at", { ascending: false });
      if (!error) setRecords(data || []);
      setLoading(false);
    };
    void load();
  }, [companyId]);

  const filteredRecords = useMemo(() => records.filter((record) => {
    const failedChecks = (record.hire_screening_checks || []).filter((check: any) => check.status === "failed");
    const matchesSearch = !deferredSearchQuery || [record.officer_profiles?.profiles?.full_name, record.officer_profiles?.profiles?.email, record.position_title, record.rejection_reason, ...failedChecks.map((check: any) => check.check_type)]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(deferredSearchQuery));
    const matchesReason = reasonFilter === "all"
      || (reasonFilter === "failed_screening" && failedChecks.length > 0)
      || (reasonFilter === "other" && failedChecks.length === 0);
    return matchesSearch && matchesReason;
  }), [deferredSearchQuery, reasonFilter, records]);
  const hasActiveFilters = Boolean(searchQuery.trim()) || reasonFilter !== "all";

  if (loading) return <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">Loading Not Hired records…</div>;

  return <div className="mx-auto max-w-6xl space-y-4">
    <div className="flex items-center gap-2"><h2 className="text-2xl font-bold">Not Hired</h2><Badge variant="secondary">{records.length}</Badge></div>
    <p className="text-sm text-muted-foreground">Closed pending hires remain here with their screening and decision history.</p>
    {records.length > 0 && <div className="border-y bg-muted/20 px-2 py-2"><div className="flex flex-col gap-2 md:flex-row md:items-center"><div className="relative min-w-0 flex-1"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search Not Hired records" className="bg-background pl-9" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search officer, position, reason, or failed check" /></div><Select value={reasonFilter} onValueChange={setReasonFilter}><SelectTrigger className="bg-background md:w-52" aria-label="Filter Not Hired records by reason"><SelectValue placeholder="All decision reasons" /></SelectTrigger><SelectContent><SelectItem value="all">All decision reasons</SelectItem><SelectItem value="failed_screening">Failed screening</SelectItem><SelectItem value="other">Other decision</SelectItem></SelectContent></Select>{hasActiveFilters && <Button type="button" size="sm" variant="ghost" onClick={() => { setSearchQuery(""); setReasonFilter("all"); }}><X className="mr-1.5 h-4 w-4" />Clear</Button>}<p className="shrink-0 text-xs text-muted-foreground">{filteredRecords.length} of {records.length}</p></div></div>}
    <div className="overflow-hidden border bg-background">
      {filteredRecords.map(record => {
        const name = record.officer_profiles?.profiles?.full_name || "Unknown officer";
        const failed = (record.hire_screening_checks || []).filter((check: any) => check.status === "failed");
        return <div key={record.id} className="grid gap-2 border-b px-3 py-2.5 last:border-b-0 hover:bg-slate-50/70 md:grid-cols-[minmax(240px,1fr)_minmax(280px,1.3fr)_auto] md:items-center md:gap-4">
          <div className="flex min-w-0 items-center gap-3"><ProfileAvatar name={name} email={record.officer_profiles?.profiles?.email} src={record.officer_profiles?.profiles?.avatar_url || record.officer_profiles?.avatar_url} /><div className="min-w-0"><p className="truncate font-semibold">{name}</p><p className="truncate text-xs text-muted-foreground">{record.position_title || "Security Officer"}</p></div></div><div className="min-w-0"><p className="truncate text-sm">{record.rejection_reason || "No reason recorded"}</p><div className="mt-1 flex flex-wrap gap-1.5"><Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">Not hired</Badge>{failed.length > 0 && <Badge variant="outline" className="border-red-200 bg-red-50 text-red-800">{failed.length} failed {failed.length === 1 ? "check" : "checks"}</Badge>}</div></div><span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"><CalendarX2 className="h-4 w-4" />{record.rejected_at ? new Date(record.rejected_at).toLocaleDateString() : "Closed"}</span>
        </div>;
      })}
      {records.length === 0 && <Card className="border-dashed"><CardContent className="flex flex-col items-center py-12 text-center"><ArchiveX className="h-10 w-10 text-muted-foreground/50" /><p className="mt-3 font-medium">No Not Hired records</p><p className="text-sm text-muted-foreground">Rejected pending hires will be retained here instead of deleted.</p></CardContent></Card>}
      {records.length > 0 && filteredRecords.length === 0 && <div className="rounded-xl border border-dashed py-10 text-center text-sm text-muted-foreground">No Not Hired records match the selected filters.</div>}
    </div>
  </div>;
}
