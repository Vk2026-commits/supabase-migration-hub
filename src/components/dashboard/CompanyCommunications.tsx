import { useEffect, useMemo, useState } from "react";
import { Phone, MessageSquare, Clock, ArrowRightLeft, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";

type Row = {
  provider_id: string;
  kind: string;
  started_at: string;
  agent_name: string;
  duration_ms: number;
  direction: string;
  from_number: string;
  to_number: string;
  status: string;
  summary: string;
  sentiment: string;
  successful: boolean | null;
  transferred: boolean;
};
const date = (s: string) =>
  s
    ? new Date(s).toLocaleString("en-US", {
        timeZone: "America/Chicago",
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZoneName: "short",
      })
    : "Not available";
const duration = (ms: number) =>
  `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
export function CompanyCommunications({ companyId, view }: { companyId: string; view: string }) {
  const [rows, setRows] = useState<Row[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [busy, setBusy] = useState(false),
    [search, setSearch] = useState(""),
    [days, setDays] = useState("30"),
    [lastSync, setLastSync] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Row | null>(null),
    [detail, setDetail] = useState<any>(null),
    [detailError, setDetailError] = useState("");
  const load = async () => {
    setError("");
    try {
      const all: Row[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await (supabase as any)
          .from("company_communications")
          .select("*")
          .eq("company_id", companyId)
          .order("started_at", { ascending: false })
          .order("provider_id")
          .range(offset, offset + 999);
        if (error) throw error;
        all.push(...data);
        if (data.length < 1000) break;
      }
      const { data, error } = await (supabase as any)
        .from("company_communication_sync")
        .select("last_sync_at")
        .eq("company_id", companyId)
        .maybeSingle();
      if (error) throw error;
      setRows(all);
      setLastSync(data?.last_sync_at || null);
    } catch {
      setError(
        "Communications could not load. Company owners, administrators, and hiring managers have access.",
      );
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 60000);
    return () => clearInterval(t);
  }, [companyId]);
  useEffect(() => {
    let active = true;
    setDetail(null);
    setDetailError("");
    if (chosen)
      void supabase.functions
        .invoke("company-communications", {
          body: { action: "detail", company_id: companyId, id: chosen.provider_id },
        })
        .then(({ data, error }) => {
          if (!active) return;
          if (error || data?.error)
            setDetailError("Could not load this conversation. Close and try again.");
          else setDetail(data);
        });
    return () => {
      active = false;
    };
  }, [chosen, companyId]);
  const sync = async () => {
    setBusy(true);
    try {
      for (const kind of ["call", "sms"]) {
        let cursor: string | null = null;
        do {
          const { data, error }: { data: any; error: any } = await supabase.functions.invoke(
            "company-communications",
            { body: { action: "sync", company_id: companyId, kind, cursor } },
          );
          if (error || data?.error) throw new Error(data?.error || "Sync failed");
          cursor = data.cursor;
        } while (cursor);
      }
      await load();
      toast.success("Call and SMS logs updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  };
  const range = useMemo(
    () =>
      rows.filter(
        (r) =>
          days === "all" ||
          new Date(r.started_at).getTime() >= Date.now() - Number(days) * 86400000,
      ),
    [rows, days],
  );
  const calls = range.filter((r) => r.kind === "call"),
    sms = range.filter((r) => r.kind === "sms");
  const shown = (view === "sms-log" ? sms : calls).filter((r) =>
    `${r.from_number} ${r.to_number} ${r.agent_name} ${r.summary} ${r.status}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const months = useMemo(() => {
    const out = new Map<
      string,
      { label: string; calls: number; ms: number; sms: number; transfers: number }
    >();
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const key = d.toLocaleDateString("en-CA", {
        timeZone: "America/Chicago",
        year: "numeric",
        month: "2-digit",
      });
      out.set(key, {
        label: d.toLocaleDateString("en-US", {
          timeZone: "America/Chicago",
          month: "short",
          year: "numeric",
        }),
        calls: 0,
        ms: 0,
        sms: 0,
        transfers: 0,
      });
    }
    for (const r of rows) {
      if (!r.started_at) continue;
      const key = new Date(r.started_at).toLocaleDateString("en-CA", {
        timeZone: "America/Chicago",
        year: "numeric",
        month: "2-digit",
      });
      const m = out.get(key);
      if (m) {
        if (r.kind === "call") {
          m.calls++;
          m.ms += r.duration_ms;
          m.transfers += Number(r.transferred);
        } else m.sms++;
      }
    }
    return [...out.values()];
  }, [rows]);
  return (
    <section className="space-y-5 min-w-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-primary">
            Kairos communications
          </p>
          <h2 className="text-2xl font-bold">
            {view === "call-log"
              ? "Call log"
              : view === "sms-log"
                ? "SMS log"
                : "Call & SMS analytics"}
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            {lastSync ? `Last synced ${date(lastSync)}` : "Sync to load Retell history"}
          </p>
        </div>
        <Button onClick={sync} disabled={busy}>
          <RefreshCw className={`mr-2 h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          {busy ? "Syncing…" : "Sync now"}
        </Button>
      </div>
      <div className="flex flex-wrap gap-3">
        <select
          aria-label="Date range"
          className="rounded-md border bg-white p-2 text-sm"
          value={days}
          onChange={(e) => setDays(e.target.value)}
        >
          <option value="7">Last 7 days</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
          <option value="all">All time</option>
        </select>
        {view !== "communications-analytics" && (
          <Input
            className="max-w-md"
            placeholder="Search phone, agent, or summary"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        )}
      </div>
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 p-4 text-red-700">
          {error}
        </p>
      )}
      {loading ? (
        <p>Loading communications…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { label: "Calls", value: calls.length, icon: Phone },
              {
                label: "Call minutes",
                value: Math.ceil(calls.reduce((n, r) => n + r.duration_ms, 0) / 60000),
                icon: Clock,
              },
              {
                label: "Transfers",
                value: calls.filter((r) => r.transferred).length,
                icon: ArrowRightLeft,
              },
              { label: "SMS conversations", value: sms.length, icon: MessageSquare },
            ].map((c) => (
              <div key={c.label} className="rounded-xl border bg-white p-5 shadow-sm">
                <c.icon className="h-5 w-5 text-primary" />
                <p className="mt-3 text-3xl font-bold">{c.value}</p>
                <p className="text-sm text-muted-foreground">{c.label}</p>
              </div>
            ))}
          </div>
          {view === "communications-analytics" ? (
            <div className="rounded-xl border bg-white p-5">
              <h3 className="font-semibold">Monthly activity</h3>
              <p className="text-sm text-muted-foreground">
                Last 12 calendar months · Central time
              </p>
              <div className="mt-5 space-y-3">
                {months.map((m) => (
                  <div
                    key={m.label}
                    className="grid grid-cols-[85px_1fr_45px] items-center gap-3 text-sm"
                  >
                    <span>{m.label}</span>
                    <div className="h-4 rounded bg-slate-100">
                      <div
                        className="h-full rounded bg-blue-600"
                        style={{
                          width: `${(m.calls / Math.max(1, ...months.map((x) => x.calls))) * 100}%`,
                        }}
                      />
                    </div>
                    <span className="text-right">{m.calls}</span>
                  </div>
                ))}
              </div>
              <div className="mt-6 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="p-3">Month</th>
                      <th>Calls</th>
                      <th>Minutes</th>
                      <th>Avg. call</th>
                      <th>Transfers</th>
                      <th>SMS conversations</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...months].reverse().map((m) => (
                      <tr key={m.label} className="border-b">
                        <td className="p-3 font-medium">{m.label}</td>
                        <td>{m.calls}</td>
                        <td>{Math.ceil(m.ms / 60000)}</td>
                        <td>{duration(m.calls ? m.ms / m.calls : 0)}</td>
                        <td>{m.transfers}</td>
                        <td>{m.sms}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border bg-white overflow-hidden">
              <div className="border-b px-5 py-3 text-sm font-medium">
                {shown.length} {view === "sms-log" ? "conversations" : "calls"}
              </div>
              {shown.length === 0 ? (
                <p className="p-8 text-sm text-muted-foreground">
                  {view === "sms-log"
                    ? "No Retell SMS conversations in this date range."
                    : "No calls in this date range."}
                </p>
              ) : (
                <div className="max-h-[650px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-left">
                      <tr>
                        <th className="p-4">Date</th>
                        <th className="p-4">Phone</th>
                        <th className="p-4">Agent / status</th>
                        <th className="p-4">{view === "sms-log" ? "Direction" : "Duration"}</th>
                        <th className="p-4">Details</th>
                      </tr>
                    </thead>
                    <tbody>
                      {shown.map((r) => (
                        <tr key={r.provider_id} className="border-t hover:bg-blue-50/30">
                          <td className="p-4 whitespace-nowrap">{date(r.started_at)}</td>
                          <td className="p-4 whitespace-nowrap">
                            <p>{r.direction === "outbound" ? r.to_number : r.from_number}</p>
                            <p className="text-xs text-muted-foreground">
                              {r.direction || "Unknown direction"}
                            </p>
                          </td>
                          <td className="p-4">
                            <p className="font-medium">{r.agent_name || "Kairos agent"}</p>
                            <span className="text-xs text-muted-foreground">
                              {r.status?.replaceAll("_", " ")}
                            </span>
                          </td>
                          <td className="p-4">
                            {view === "sms-log" ? r.direction : duration(r.duration_ms)}
                          </td>
                          <td className="p-4">
                            <Button variant="outline" size="sm" onClick={() => setChosen(r)}>
                              View
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
      <Dialog
        open={Boolean(chosen)}
        onOpenChange={(open) => {
          if (!open) setChosen(null);
        }}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {chosen?.kind === "sms" ? "SMS conversation" : "Call details"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">{chosen && date(chosen.started_at)}</p>
          {chosen?.summary && (
            <div className="rounded-lg bg-blue-50 p-4 text-sm">{chosen.summary}</div>
          )}
          {detailError ? (
            <p role="alert">{detailError}</p>
          ) : !detail ? (
            <p>Loading conversation…</p>
          ) : (
            <>
              {detail.recording_url && (
                <audio controls preload="none" className="w-full" src={detail.recording_url} />
              )}
              <h3 className="font-semibold">Transcript</h3>
              <div className="whitespace-pre-wrap text-sm leading-relaxed">
                {detail.transcript ||
                  detail.messages?.map((m: any) => `${m.role}: ${m.content}`).join("\n\n") ||
                  "No transcript available."}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
