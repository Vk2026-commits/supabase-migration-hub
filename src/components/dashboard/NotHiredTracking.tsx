import { useEffect, useState } from "react";
import { ArchiveX, CalendarX2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ProfileAvatar } from "./ProfileAvatar";

type Props = { companyId: string };

export default function NotHiredTracking({ companyId }: Props) {
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

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

  if (loading) return <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">Loading Not Hired records…</div>;

  return <div className="mx-auto max-w-6xl space-y-4">
    <div className="flex items-center gap-2"><h2 className="text-2xl font-bold">Not Hired</h2><Badge variant="secondary">{records.length}</Badge></div>
    <p className="text-sm text-muted-foreground">Closed pending hires remain here with their screening and decision history.</p>
    <div className="space-y-3">
      {records.map(record => {
        const name = record.officer_profiles?.profiles?.full_name || "Unknown officer";
        const failed = (record.hire_screening_checks || []).filter((check: any) => check.status === "failed");
        return <Card key={record.id} className="border-slate-200"><CardContent className="p-4 sm:p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start"><ProfileAvatar name={name} email={record.officer_profiles?.profiles?.email} src={record.officer_profiles?.profiles?.avatar_url || record.officer_profiles?.avatar_url} /><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold">{name}</h3><Badge variant="outline" className="border-slate-300 bg-slate-50 text-slate-700">Not hired</Badge>{failed.length > 0 && <Badge variant="outline" className="border-red-200 bg-red-50 text-red-800">{failed.length} failed {failed.length === 1 ? "check" : "checks"}</Badge>}</div><p className="mt-0.5 text-xs text-muted-foreground">{record.position_title || "Security Officer"}</p><div className="mt-3 rounded-lg border bg-muted/20 p-3"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Decision reason</p><p className="mt-1 text-sm">{record.rejection_reason || "No reason recorded"}</p></div>{failed.length > 0 && <p className="mt-2 text-xs text-red-700">Failed: {failed.map((check: any) => String(check.check_type).replace(/_/g, " ")).join(", ")}</p>}</div><span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground"><CalendarX2 className="h-4 w-4" />{record.rejected_at ? new Date(record.rejected_at).toLocaleDateString() : "Closed"}</span></div>
        </CardContent></Card>;
      })}
      {records.length === 0 && <Card className="border-dashed"><CardContent className="flex flex-col items-center py-12 text-center"><ArchiveX className="h-10 w-10 text-muted-foreground/50" /><p className="mt-3 font-medium">No Not Hired records</p><p className="text-sm text-muted-foreground">Rejected pending hires will be retained here instead of deleted.</p></CardContent></Card>}
    </div>
  </div>;
}
