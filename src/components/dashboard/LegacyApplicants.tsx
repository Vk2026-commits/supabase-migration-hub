import { Mail } from "lucide-react";
import { legacyEmailValid, legacyInviteStatus } from "@/lib/legacyApplication";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const label = (s: string) =>
  s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (x) => x.toUpperCase());
export function LegacyAnswer({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "")
    return <span className="text-muted-foreground">Not provided</span>;
  if (typeof value === "boolean") return <strong>{value ? "Yes" : "No"}</strong>;
  if (Array.isArray(value))
    return (
      <div className="space-y-3">
        {value.length
          ? value.map((v, i) => (
              <div key={i} className="rounded border p-3">
                <LegacyAnswer value={v} />
              </div>
            ))
          : "Not provided"}
      </div>
    );
  if (typeof value === "object")
    return (
      <dl className="grid gap-3 sm:grid-cols-2">
        {Object.entries(value).map(([k, v]) => (
          <div key={k} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{label(k)}</dt>
            <dd className="break-words">
              <LegacyAnswer value={v} />
            </dd>
          </div>
        ))}
      </dl>
    );
  return <strong className="whitespace-pre-wrap break-words">{String(value)}</strong>;
}
export function LegacyApplicants({
  companyId,
  canInvite = false,
}: {
  companyId: string;
  canInvite?: boolean;
}) {
  const [invites, setInvites] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [preview, setPreview] = useState<any[] | null>(null);
  const [jobId, setJobId] = useState("");
  const [sending, setSending] = useState(false);
  const [loadReady, setLoadReady] = useState(false);
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setRows([]);
    setError(false);
    setLoadReady(false);
    setSelected([]);
    setPreview(null);
    Promise.all([
      (supabase as any)
        .from("legacy_applicant_invitations")
        .select(
          "id,legacy_id,group_id,job_posting_id,recipient_email,created_at,expires_at,revoked_at,claimed_at,confirmed_at,email_status,last_error",
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
      supabase
        .from("job_postings")
        .select("id,title,location,created_at")
        .eq("company_id", companyId)
        .eq("status", "active"),
    ])
      .then(([invitations, positions]) => {
        if (!active) return;
        if (invitations.error || positions.error) {
          setError(true);
          return;
        }
        setInvites(invitations.data || []);
        setJobs(positions.data || []);
        setLoadReady(true);
      })
      .catch(() => {
        if (active) setError(true);
      });
    (supabase as any)
      .from("company_legacy_applications")
      .select("*")
      .eq("company_id", companyId)
      .order("source_submitted_at", { ascending: false })
      .then(({ data, error }: any) => {
        if (active) {
          setRows(data || []);
          if (error) setError(true);
        }
      });
    return () => {
      active = false;
    };
  }, [companyId, retry]);
  if (error)
    return (
      <div className="my-4 rounded border p-4">
        Legacy applications could not load.{" "}
        <Button variant="outline" onClick={() => setRetry((x) => x + 1)}>
          Retry
        </Button>
      </div>
    );
  const latestInvite = (r: any) =>
    invites.find((i) => i.group_id === (r.duplicate_group_id || r.id));
  const openPreview = (recipients: any[]) => {
    setJobId("");
    setPreview(recipients.map((r) => ({ ...r, request_id: crypto.randomUUID() })));
  };
  const send = async () => {
    if (sending || !preview?.length || !jobId) return;
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("legacy-applicant-invitations", {
        body: {
          action: "send",
          company_id: companyId,
          job_id: jobId,
          confirm: true,
          recipients: preview.map((r) => ({ legacy_id: r.id, request_id: r.request_id })),
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Sending failed");
      const failed = data.results.filter((r: any) => r.status === "failed");
      if (failed.length)
        toast.error(`${failed.length} invitation(s) failed. Review their status before resending.`);
      else toast.success("Invitations processed. Delivery status is shown separately.");
      setPreview(null);
      setSelected([]);
      setRetry((n) => n + 1);
    } catch (e: any) {
      toast.error(e.message || "Unable to send. Retry checks the same request.");
    } finally {
      setSending(false);
    }
  };
  const refreshDelivery = async () => {
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("legacy-applicant-invitations", {
        body: { action: "refresh", company_id: companyId },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message);
      setRetry((n) => n + 1);
    } catch (e: any) {
      toast.error(e.message || "Could not refresh delivery status");
    } finally {
      setSending(false);
    }
  };
  if (!rows.length)
    return (
      <p className="p-5 text-sm text-muted-foreground">
        {loadReady ? "No imported applications." : "Loading imported applications…"}
      </p>
    );
  // Only group duplicates explicitly confirmed on the server. Never merge by name.
  const groups = new Map<string, any[]>();
  for (const row of rows) {
    const key = row.duplicate_group_id || row.id;
    groups.set(key, [...(groups.get(key) || []), row]);
  }
  const applicants = [...groups.values()];
  const filtered = applicants.filter((submissions) =>
    submissions.some((r) =>
      `${r.applicant_name} ${r.email} ${r.phone} ${r.position}`
        .toLowerCase()
        .includes(search.toLowerCase()),
    ),
  );
  const allRecipients = applicants
    .map((group) => group[0])
    .filter((row) => legacyEmailValid(row.email) && !latestInvite(row)?.claimed_at);
  const selectableIds = filtered
    .map((group) => group[0])
    .filter((row) => legacyEmailValid(row.email) && !latestInvite(row)?.claimed_at)
    .map((row) => row.id);
  const allVisibleSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selected.includes(id));
  return (
    <section className="mb-6 rounded-xl border bg-white p-5">
      <h3 className="text-lg font-semibold">
        Imported applicants{" "}
        <span className="text-sm text-muted-foreground">({applicants.length})</span>
      </h3>
      <p className="mb-4 text-sm text-muted-foreground">
        Original applications from August 6, 2026 onward. These records have not been submitted
        through We Find Guards. No account or invitation was created by this import. Confirmed
        duplicate submissions are grouped under one person, with every original application
        preserved.
      </p>
      {canInvite && (
        <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-5">
          <h4 className="text-lg font-semibold text-blue-950">Invite everyone by email</h4>
          <p className="mt-1 mb-4 text-sm text-blue-900">
            Send account invitations to all {allRecipients.length} eligible applicants at once. No
            need to select each person.
          </p>
          <Button
            size="lg"
            className="h-auto w-full whitespace-normal py-3 text-base sm:w-auto"
            disabled={!loadReady || sending || !allRecipients.length}
            onClick={() => openPreview(allRecipients)}
          >
            <Mail className="mr-2 h-5 w-5 shrink-0" aria-hidden="true" />
            Email invitations to all {allRecipients.length} applicants
          </Button>
          <p className="mt-3 text-sm text-blue-900">
            You’ll review the recipients, choose a job, and confirm before any emails are sent. This
            includes all eligible applicants, even when a search is active.
          </p>
          <p className="mt-1 text-xs text-blue-800">
            Applicants with missing or invalid emails or accepted invitations are excluded.
          </p>
        </div>
      )}
      {canInvite && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <span className="w-full text-sm font-medium text-muted-foreground">
            Or choose specific applicants:
          </span>
          <Button
            variant="outline"
            disabled={!loadReady || sending || !selectableIds.length}
            onClick={() =>
              setSelected((current) =>
                allVisibleSelected
                  ? current.filter((id) => !selectableIds.includes(id))
                  : [...new Set([...current, ...selectableIds])],
              )
            }
          >
            {allVisibleSelected
              ? "Deselect all"
              : search.trim()
                ? "Select all results"
                : "Select all"}
          </Button>
          <Button
            variant="ghost"
            disabled={sending || !selected.length}
            onClick={() => setSelected([])}
          >
            Clear selection
          </Button>
          <Button
            variant="outline"
            disabled={!loadReady || sending || !selected.length}
            onClick={() =>
              openPreview(applicants.map((g) => g[0]).filter((r) => selected.includes(r.id)))
            }
          >
            Email invitations to selected ({selected.length})
          </Button>
          <Button variant="outline" disabled={sending || !invites.length} onClick={refreshDelivery}>
            Refresh delivery status
          </Button>
        </div>
      )}
      <Input
        aria-label="Search imported applications"
        placeholder="Search imported applicants by name, email, phone or position"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <p className="my-2 text-xs text-muted-foreground">
        Select all includes eligible applicants in the current search results. Missing or invalid
        emails and accepted invitations are skipped.
        <br />
        Showing {filtered.length} of {applicants.length} applicant entries · {rows.length} original
        submissions
      </p>
      <div className="space-y-2">
        {filtered.map((submissions) => {
          const r = submissions[0];
          return (
            <div key={r.id} className="rounded-lg border">
              <div className="flex flex-wrap items-center gap-3 p-3">
                {canInvite && (
                  <input
                    type="checkbox"
                    aria-label={`Select ${r.applicant_name}`}
                    checked={selected.includes(r.id)}
                    disabled={
                      !loadReady ||
                      sending ||
                      !legacyEmailValid(r.email) ||
                      Boolean(latestInvite(r)?.claimed_at)
                    }
                    onChange={(e) =>
                      setSelected((v) =>
                        e.target.checked ? [...v, r.id] : v.filter((id) => id !== r.id),
                      )
                    }
                  />
                )}
                <span className="text-sm">
                  {legacyEmailValid(r.email)
                    ? legacyInviteStatus(latestInvite(r))
                    : "Email missing or invalid"}
                </span>
                {canInvite && (
                  <Button
                    className="ml-auto"
                    variant="outline"
                    disabled={
                      !loadReady ||
                      sending ||
                      !legacyEmailValid(r.email) ||
                      Boolean(latestInvite(r)?.claimed_at)
                    }
                    onClick={() => openPreview([r])}
                  >
                    {latestInvite(r) ? "Resend invitation" : "Send invitation"}
                  </Button>
                )}
              </div>
              {latestInvite(r)?.last_error && (
                <p role="alert" className="px-4 text-sm text-red-700">
                  {latestInvite(r).last_error}
                </p>
              )}
              <details className="rounded-lg border p-4">
                <summary className="cursor-pointer">
                  <span className="font-semibold">{r.applicant_name}</span>
                  <span className="ml-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">
                    Legacy application
                  </span>
                  {submissions.length > 1 && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {submissions.length} submissions
                    </span>
                  )}
                  {submissions.some((s) => s.matched_officer_id) && (
                    <span className="ml-2 rounded bg-blue-50 px-2 py-1 text-xs text-blue-800">
                      Existing We Find Guards account
                    </span>
                  )}
                  <div className="mt-2 text-sm text-muted-foreground">
                    {r.position} · {r.email} · {r.phone}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {submissions.length > 1 ? "Latest submission:" : "Originally submitted:"}{" "}
                    {new Intl.DateTimeFormat("en-US", {
                      timeZone: "America/Chicago",
                      dateStyle: "medium",
                      timeStyle: "short",
                    }).format(new Date(r.source_submitted_at))}{" "}
                    (Central)
                  </div>
                </summary>
                <div className="mt-4 border-t pt-4">
                  <p className="mb-4 text-sm text-muted-foreground">
                    Imported from apply.kairossecurity.com. Social Security numbers are excluded;
                    collect those through secure onboarding. Original answers below are historical,
                    not newly confirmed or signed.
                  </p>
                  {submissions.some((s) => s.matched_officer_id) && (
                    <p className="mb-4 rounded bg-blue-50 p-3 text-sm text-blue-900">
                      Matched to an existing officer account by email. Do not create another
                      account. These historical submissions do not change their current application
                      or hiring status.
                    </p>
                  )}
                  {submissions.map((submission, index) => (
                    <details
                      key={submission.id}
                      open={submissions.length === 1}
                      className="mb-3 rounded border p-3"
                    >
                      <summary className="cursor-pointer font-medium">
                        {index === 0 ? "Latest application" : "Earlier application"} ·{" "}
                        {new Intl.DateTimeFormat("en-US", {
                          timeZone: "America/Chicago",
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(submission.source_submitted_at))}{" "}
                        (Central)
                      </summary>
                      <div className="mt-4">
                        <LegacyAnswer
                          value={Object.fromEntries(
                            Object.entries(submission.application_data).filter(
                              ([k]) => !["id", "created_at", "full_form_data"].includes(k),
                            ),
                          )}
                        />
                      </div>
                    </details>
                  ))}
                </div>
              </details>
            </div>
          );
        })}
      </div>
      <Dialog
        open={Boolean(preview)}
        onOpenChange={(open) => {
          if (!open && !sending) setPreview(null);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Review invitation emails</DialogTitle>
            <DialogDescription>
              No email is sent until you click Confirm and send.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 text-sm">
            {preview?.map((r) => (
              <li key={r.id}>
                {r.applicant_name} — {r.email}
              </li>
            ))}
          </ul>
          <label htmlFor="legacy-job" className="font-medium">
            Kairos job
          </label>
          <select
            id="legacy-job"
            value={jobId}
            onChange={(e) => setJobId(e.target.value)}
            className="w-full rounded border bg-background p-2"
            disabled={sending}
          >
            <option value="">Select an active position</option>
            {jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title} — {j.location || "Location not listed"} · Posted{" "}
                {new Date(j.created_at).toLocaleDateString()}
              </option>
            ))}
          </select>
          {!jobs.length && (
            <p>No active positions available. Create or activate a job before sending.</p>
          )}
          <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-3">
            <p className="font-semibold">Kairos Security: review your saved application</p>
            <p>
              Kairos Security already has your application. Join We Find Guards to review your saved
              information and continue the hiring process.
            </p>
            <p>
              Create an officer account or sign in using this email address. Review your previous
              answers, complete missing information, and provide a new signature. Existing
              application progress is preserved.
            </p>
            <p className="font-semibold">Review my application [secure personal link]</p>
            <p>This invitation expires in 7 days.</p>
          </div>
          {preview?.some((r) => latestInvite(r)) && (
            <p className="text-sm">Resending replaces the previous invitation link.</p>
          )}
          <Button disabled={sending || !jobId} onClick={send}>
            {sending ? "Sending…" : "Confirm and send"}
          </Button>
          <Button variant="outline" disabled={sending} onClick={() => setPreview(null)}>
            Cancel
          </Button>
        </DialogContent>
      </Dialog>
    </section>
  );
}
