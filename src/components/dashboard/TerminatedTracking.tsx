import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { ExternalLink, Search, UserX, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ProfileAvatar } from "./ProfileAvatar";

type Props = { companyId: string };

export default function TerminatedTracking({ companyId }: Props) {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery.trim().toLowerCase());

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("hires")
        .select("*,officer_profiles(*,profiles(full_name,email,avatar_url))")
        .eq("company_id", companyId)
        .eq("status", "terminated")
        .order("terminated_at", { ascending: false });
      if (error) console.error("Failed to load terminated employment records", error);
      else if (active) setRecords(data || []);
      if (active) setLoading(false);
    };
    void load();
    return () => { active = false; };
  }, [companyId]);

  const filteredRecords = useMemo(() => records.filter((record) => {
    if (!deferredSearchQuery) return true;
    return [record.officer_profiles?.profiles?.full_name, record.officer_profiles?.profiles?.email, record.position_title, record.termination_reason]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(deferredSearchQuery));
  }), [deferredSearchQuery, records]);

  const openProfile = (officerId: string) => {
    const params = new URLSearchParams({ companyId, officerId, officerSource: "terminated-roster" });
    window.open(`/browse?${params.toString()}`, "_blank", "noopener,noreferrer");
  };

  if (loading) return <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">Loading terminated employment records…</div>;

  return <div className="mx-auto max-w-6xl space-y-4">
    <div className="flex items-center gap-2"><h2 className="text-2xl font-bold">Terminated</h2><Badge variant="secondary">{records.length}</Badge></div>
    <p className="text-sm text-muted-foreground">Former employees are retained here with the documented reason and employment history.</p>
    {records.length > 0 && <div className="border-y bg-muted/20 p-2"><div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input aria-label="Search terminated employment records" className="bg-background pl-9 pr-10" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search officer, position, or termination reason" />{searchQuery && <Button type="button" size="icon" variant="ghost" className="absolute right-1 top-1/2 h-8 w-8 -translate-y-1/2" onClick={() => setSearchQuery("")}><X className="h-4 w-4" /><span className="sr-only">Clear search</span></Button>}</div></div>}
    <div className="overflow-hidden rounded-lg border bg-background">
      {filteredRecords.map((record) => {
        const name = record.officer_profiles?.profiles?.full_name || "Unknown officer";
        return <div key={record.id} className="grid gap-3 border-b p-4 last:border-b-0 md:grid-cols-[minmax(230px,1fr)_minmax(260px,1.3fr)_auto] md:items-center">
          <div className="flex min-w-0 items-center gap-3"><ProfileAvatar name={name} email={record.officer_profiles?.profiles?.email} src={record.officer_profiles?.profiles?.avatar_url || record.officer_profiles?.avatar_url} /><div className="min-w-0"><p className="truncate font-semibold">{name}</p><p className="truncate text-xs text-muted-foreground">{record.position_title || "Security Officer"}</p></div></div>
          <div className="min-w-0"><p className="text-sm">{record.termination_reason || "No reason recorded"}</p><div className="mt-1 flex flex-wrap gap-2"><Badge variant="outline" className="border-red-200 bg-red-50 text-red-800">Terminated</Badge><span className="text-xs text-muted-foreground">{record.terminated_at ? `Ended ${new Date(record.terminated_at).toLocaleDateString()}` : "End date not recorded"}</span></div></div>
          <Button type="button" size="sm" variant="outline" onClick={() => openProfile(record.officer_id)}><ExternalLink className="mr-2 h-4 w-4" />View profile</Button>
        </div>;
      })}
      {records.length === 0 && <Card className="border-dashed"><CardContent className="flex flex-col items-center py-12 text-center"><UserX className="h-10 w-10 text-muted-foreground/50" /><p className="mt-3 font-medium">No terminated employees</p><p className="text-sm text-muted-foreground">Employees ended through the Hired Officers roster will be retained here.</p></CardContent></Card>}
      {records.length > 0 && filteredRecords.length === 0 && <div className="p-10 text-center text-sm text-muted-foreground">No terminated employment records match this search.</div>}
    </div>
  </div>;
}
