import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const label = (s: string) =>
  s
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/^./, (x) => x.toUpperCase());
function Answer({ value }: { value: unknown }) {
  if (value === null || value === undefined || value === "")
    return <span className="text-muted-foreground">Not provided</span>;
  if (typeof value === "boolean") return <strong>{value ? "Yes" : "No"}</strong>;
  if (Array.isArray(value))
    return (
      <div className="space-y-3">
        {value.length
          ? value.map((v, i) => (
              <div key={i} className="rounded border p-3">
                <Answer value={v} />
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
              <Answer value={v} />
            </dd>
          </div>
        ))}
      </dl>
    );
  return <strong className="whitespace-pre-wrap break-words">{String(value)}</strong>;
}
export function LegacyApplicants({ companyId }: { companyId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setRows([]);
    setError(false);
    (supabase as any)
      .from("company_legacy_applications")
      .select("*")
      .eq("company_id", companyId)
      .order("source_submitted_at", { ascending: false })
      .then(({ data, error }: any) => {
        if (active) {
          setRows(data || []);
          setError(Boolean(error));
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
  if (!rows.length) return null;
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
  return (
    <section className="mb-6 rounded-xl border bg-white p-5">
      <h3 className="text-lg font-semibold">
        Imported Kairos applications{" "}
        <span className="text-sm text-muted-foreground">({applicants.length})</span>
      </h3>
      <p className="mb-4 text-sm text-muted-foreground">
        Original applications from August 6, 2026 onward. These records have not been submitted
        through We Find Guards. No account or invitation was created by this import. Confirmed
        duplicate submissions are grouped under one person, with every original application
        preserved.
      </p>
      <Input
        aria-label="Search imported applications"
        placeholder="Search imported applicants by name, email, phone or position"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <p className="my-2 text-xs text-muted-foreground">
        Showing {filtered.length} of {applicants.length} applicant entries · {rows.length} original
        submissions
      </p>
      <div className="space-y-2">
        {filtered.map((submissions) => {
          const r = submissions[0];
          return (
            <details key={r.id} className="rounded-lg border p-4">
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
                    Matched to an existing officer account by email. Do not create another account.
                    These historical submissions do not change their current application or hiring
                    status.
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
                      <Answer
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
          );
        })}
      </div>
    </section>
  );
}
