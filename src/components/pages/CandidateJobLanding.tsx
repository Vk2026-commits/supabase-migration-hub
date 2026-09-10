import { useEffect, useState } from "react";
import { useParams } from "@tanstack/react-router";
import { Briefcase, CheckCircle2, DollarSign, MapPin, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function CandidateJobLanding() {
  const { jobId } = useParams({ from: "/jobs/$jobId" });
  const [job, setJob] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ fullName: "", email: "", phone: "" });

  useEffect(() => {
    supabase.from("job_postings").select("id,title,description,location,employment_type,shift_type,hourly_rate_min,hourly_rate_max,requirements,company_profiles(company_name,logo_url)").eq("id", jobId).eq("status", "active").maybeSingle()
      .then(({ data, error }) => { if (error) console.error(error); setJob(data); setLoading(false); });
  }, [jobId]);

  const continueToAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("capture_candidate_job_lead", { _job_id: jobId, _full_name: form.fullName, _email: form.email, _phone: form.phone, _source: "company_job_link" });
      if (error) throw error;
      const leadId = String(data);
      sessionStorage.setItem(`candidate-lead:${leadId}`, JSON.stringify(form));
      const next = `/dashboard?onboarding=application&job=${encodeURIComponent(jobId)}&lead=${encodeURIComponent(leadId)}`;
      window.location.assign(`/auth?mode=signup&role=officer&lead=${encodeURIComponent(leadId)}&next=${encodeURIComponent(next)}`);
    } catch (error: any) {
      toast.error(error.message || "We could not save your information");
      setSaving(false);
    }
  };

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-50 text-muted-foreground">Loading job…</main>;
  if (!job) return <main className="grid min-h-screen place-items-center bg-slate-50 p-6"><Card className="max-w-lg"><CardContent className="p-8 text-center"><h1 className="text-2xl font-bold">This job is no longer available</h1><p className="mt-2 text-muted-foreground">Ask the hiring company for an updated job link.</p></CardContent></Card></main>;
  const company = Array.isArray(job.company_profiles) ? job.company_profiles[0] : job.company_profiles;

  return <main className="min-h-screen bg-slate-50">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-6xl items-center gap-3 px-5 py-5"><ShieldCheck className="h-8 w-8 text-primary" /><span className="text-xl font-bold">We Find Guards</span></div></header>
    <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 lg:grid-cols-[1fr_420px] lg:py-16">
      <section>
        {company?.logo_url && <img src={company.logo_url} alt="" className="mb-6 h-16 w-auto object-contain" />}
        <Badge className="mb-4">Now hiring</Badge>
        <h1 className="text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">{job.title}</h1>
        <p className="mt-3 text-xl text-slate-600">{company?.company_name}</p>
        <div className="mt-6 flex flex-wrap gap-4 text-sm text-slate-700"><span className="flex items-center gap-2"><MapPin className="h-4 w-4 text-primary" />{job.location}</span>{job.hourly_rate_min && <span className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-primary" />${job.hourly_rate_min}{job.hourly_rate_max ? `–$${job.hourly_rate_max}` : ""} per hour</span>}</div>
        <div className="mt-8 flex flex-wrap gap-2">{[...(job.employment_type || []), ...(job.shift_type || [])].map((item: string) => <Badge key={item} variant="outline" className="bg-white">{item}</Badge>)}</div>
        {job.description && <div className="mt-10"><h2 className="text-xl font-bold">About this position</h2><p className="mt-3 whitespace-pre-wrap leading-7 text-slate-700">{job.description}</p></div>}
        {job.requirements && <div className="mt-8"><h2 className="text-xl font-bold">What you’ll need</h2><p className="mt-3 whitespace-pre-wrap leading-7 text-slate-700">{job.requirements}</p></div>}
      </section>
      <Card className="h-fit border-primary/20 shadow-xl lg:sticky lg:top-8"><CardContent className="p-6 sm:p-8"><Briefcase className="h-9 w-9 rounded-lg bg-primary p-2 text-white" /><h2 className="mt-5 text-2xl font-bold">Start your application</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">Tell the hiring team how to reach you. Next, you’ll create a secure officer login and continue the job application.</p>
        <form onSubmit={continueToAccount} className="mt-6 space-y-4"><div><Label htmlFor="lead-name">Full name</Label><Input id="lead-name" className="mt-2 h-12" autoComplete="name" value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} required /></div><div><Label htmlFor="lead-email">Email</Label><Input id="lead-email" className="mt-2 h-12" type="email" autoComplete="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} required /></div><div><Label htmlFor="lead-phone">Mobile phone</Label><Input id="lead-phone" className="mt-2 h-12" type="tel" autoComplete="tel" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} required /></div><Button className="h-12 w-full text-base" disabled={saving}>{saving ? "Saving…" : "Continue to create login"}</Button></form>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">By continuing, you agree that We Find Guards and this hiring company may contact you about this position. Creating an account is required to complete and submit the application.</p>
        <div className="mt-5 flex gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" /><span>Your information is connected only to this job and its hiring company.</span></div>
      </CardContent></Card>
    </div>
  </main>;
}
