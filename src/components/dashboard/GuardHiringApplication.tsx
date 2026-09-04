import { useEffect, useMemo, useState } from "react";
import { Download, ExternalLink, FileCheck2, ShieldCheck } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { generateGuardApplicationPDF, type GuardApplicationData } from "@/lib/generateGuardApplicationPDF";

interface GuardHiringApplicationProps {
  userId: string;
  officerId: string | null;
}

const blankJob = { employer: "", title: "", dates: "", supervisor: "", phone: "", reason: "" };
const blankReference = { name: "", relationship: "", phone: "", email: "" };

const initialForm: GuardApplicationData = {
  applicantName: "", email: "", phone: "", address: "", city: "", state: "", zip: "",
  companyName: "General We Find Guards Application", position: "Security Officer", employmentType: "full-time",
  startDate: "", licenseLevels: [], eligibleToWork: "", isAdult: "", driversLicense: "",
  securityLicenseNumber: "", securityLicenseState: "", education: "", skills: "",
  workHistory: [{ ...blankJob }, { ...blankJob }],
  references: [{ ...blankReference }, { ...blankReference }, { ...blankReference }],
  signature: "", signatureDate: new Date().toISOString().slice(0, 10),
};

const FormField = ({ label, value, onChange, type = "text", required = false }: {
  label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean;
}) => (
  <div className="space-y-2">
    <Label>{label}{required ? " *" : ""}</Label>
    <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} required={required} />
  </div>
);

const YesNo = ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => (
  <div className="space-y-2">
    <Label>{label} *</Label>
    <RadioGroup value={value} onValueChange={onChange} className="flex gap-6">
      <div className="flex items-center gap-2"><RadioGroupItem value="Yes" id={`${label}-yes`} /><Label htmlFor={`${label}-yes`}>Yes</Label></div>
      <div className="flex items-center gap-2"><RadioGroupItem value="No" id={`${label}-no`} /><Label htmlFor={`${label}-no`}>No</Label></div>
    </RadioGroup>
  </div>
);

export function GuardHiringApplication({ userId, officerId }: GuardHiringApplicationProps) {
  const [form, setForm] = useState<GuardApplicationData>(initialForm);
  const [applicationId, setApplicationId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [jobs, setJobs] = useState<Array<{ id: string; companyName: string; position: string }>>([]);

  useEffect(() => {
    const load = async () => {
      const [{ data: profile }, { data: officer }] = await Promise.all([
        supabase.from("profiles").select("full_name,email").eq("id", userId).maybeSingle(),
        supabase.from("officer_profiles").select("phone,address_street,address_city,address_state,address_zip").eq("user_id", userId).maybeSingle(),
      ]);

      setForm((current) => ({
        ...current,
        applicantName: profile?.full_name || current.applicantName,
        email: profile?.email || current.email,
        phone: officer?.phone || current.phone,
        address: officer?.address_street || current.address,
        city: officer?.address_city || current.city,
        state: officer?.address_state || current.state,
        zip: officer?.address_zip || current.zip,
      }));

      if (!officerId) return;
      const { data } = await supabase
        .from("job_applications")
        .select("id,job_posting:job_postings(title,company:company_profiles(company_name))")
        .eq("officer_id", officerId);
      setJobs((data || []).map((item: any) => ({
        id: item.id,
        position: item.job_posting?.title || "Security Officer",
        companyName: item.job_posting?.company?.company_name || "Hiring Company",
      })));
    };
    load();
  }, [userId, officerId]);

  const complete = useMemo(() => Boolean(
    form.applicantName && form.email && form.phone && form.address && form.city && form.state && form.zip &&
    form.position && form.isAdult && form.eligibleToWork && form.signature && acknowledged
  ), [form, acknowledged]);

  const update = <K extends keyof GuardApplicationData>(key: K, value: GuardApplicationData[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const updateList = (key: "workHistory" | "references", index: number, field: string, value: string) => {
    setForm((current) => ({
      ...current,
      [key]: current[key].map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item),
    }));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!complete || !officerId) {
      toast.error(officerId ? "Complete all required application fields" : "Complete your officer profile before applying");
      return;
    }
    setSubmitting(true);
    try {
      const selectedJob = jobs.find((job) => job.companyName === form.companyName && job.position === form.position);
      const payload = {
        officer_id: officerId,
        user_id: userId,
        job_application_id: selectedJob?.id || null,
        company_name: form.companyName,
        position: form.position,
        applicant_name: form.applicantName,
        applicant_email: form.email,
        status: "submitted",
        submitted_at: new Date().toISOString(),
        signature_name: form.signature,
        signature_date: form.signatureDate,
        application_data: form,
      };
      const query = applicationId
        ? (supabase as any).from("guard_hiring_applications").update(payload).eq("id", applicationId).select("id").single()
        : (supabase as any).from("guard_hiring_applications").insert(payload).select("id").single();
      const { data, error } = await query;
      if (error) throw error;
      setApplicationId(data.id);
      toast.success("Hiring application submitted");
      generateGuardApplicationPDF(form);
    } catch (error: any) {
      toast.error(error.message || "Could not submit the hiring application");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card className="border-primary/30 bg-primary/5">
        <CardHeader>
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-1 h-7 w-7 text-primary" />
            <div><CardTitle>Security Officer Hiring Application</CardTitle><CardDescription>Complete one application that a participating security company can review during hiring.</CardDescription></div>
          </div>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader><CardTitle>Position</CardTitle><CardDescription>Select a company you already expressed interest in, or submit a general application.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2 md:col-span-2">
            <Label>Hiring company</Label>
            <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={`${form.companyName}|${form.position}`} onChange={(event) => {
              const [companyName, position] = event.target.value.split("|");
              setForm((current) => ({ ...current, companyName, position }));
            }}>
              <option value="General We Find Guards Application|Security Officer">General We Find Guards Application</option>
              {jobs.map((job) => <option key={job.id} value={`${job.companyName}|${job.position}`}>{job.companyName} — {job.position}</option>)}
            </select>
          </div>
          <FormField label="Position applied for" value={form.position} onChange={(value) => update("position", value)} required />
          <FormField label="Available start date" value={form.startDate} onChange={(value) => update("startDate", value)} type="date" />
          <div className="space-y-2 md:col-span-2"><Label>Employment sought</Label><RadioGroup value={form.employmentType} onValueChange={(value) => update("employmentType", value)} className="flex flex-wrap gap-6">{["full-time", "part-time", "temporary"].map((value) => <div key={value} className="flex items-center gap-2"><RadioGroupItem value={value} id={value} /><Label htmlFor={value} className="capitalize">{value}</Label></div>)}</RadioGroup></div>
          <div className="space-y-2 md:col-span-2"><Label>Security license level(s)</Label><div className="flex flex-wrap gap-6">{["Level II", "Level III", "Level IV"].map((level) => <div key={level} className="flex items-center gap-2"><Checkbox checked={form.licenseLevels.includes(level)} onCheckedChange={(checked) => update("licenseLevels", checked ? [...form.licenseLevels, level] : form.licenseLevels.filter((item) => item !== level))} id={level} /><Label htmlFor={level}>{level}</Label></div>)}</div></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Personal Information</CardTitle><CardDescription>We prefilled information already saved in your We Find Guards profile.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <FormField label="Full legal name" value={form.applicantName} onChange={(value) => update("applicantName", value)} required />
          <FormField label="Email" value={form.email} onChange={(value) => update("email", value)} type="email" required />
          <FormField label="Phone" value={form.phone} onChange={(value) => update("phone", value)} type="tel" required />
          <FormField label="Street address" value={form.address} onChange={(value) => update("address", value)} required />
          <FormField label="City" value={form.city} onChange={(value) => update("city", value)} required />
          <div className="grid grid-cols-2 gap-3"><FormField label="State" value={form.state} onChange={(value) => update("state", value)} required /><FormField label="ZIP" value={form.zip} onChange={(value) => update("zip", value)} required /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Eligibility and Credentials</CardTitle></CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <YesNo label="Are you 18 years of age or older?" value={form.isAdult} onChange={(value) => update("isAdult", value)} />
          <YesNo label="Can you provide proof that you may work in the U.S.?" value={form.eligibleToWork} onChange={(value) => update("eligibleToWork", value)} />
          <YesNo label="Do you have a valid driver's license?" value={form.driversLicense} onChange={(value) => update("driversLicense", value)} />
          <FormField label="Security license number" value={form.securityLicenseNumber} onChange={(value) => update("securityLicenseNumber", value)} />
          <FormField label="Security license state" value={form.securityLicenseState} onChange={(value) => update("securityLicenseState", value)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Education and Security Qualifications</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2"><Label>Highest education, school, diploma, or degree</Label><Textarea value={form.education} onChange={(event) => update("education", event.target.value)} /></div>
          <div className="space-y-2"><Label>Security training, certifications, relevant skills, and equipment you can operate</Label><Textarea value={form.skills} onChange={(event) => update("skills", event.target.value)} rows={4} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Employment History</CardTitle><CardDescription>List your current or most recent employer first.</CardDescription></CardHeader>
        <CardContent className="space-y-5">{form.workHistory.map((job, index) => <div key={index} className="grid gap-3 rounded-lg border p-4 md:grid-cols-2"><FormField label="Employer" value={job.employer} onChange={(value) => updateList("workHistory", index, "employer", value)} /><FormField label="Job title and duties" value={job.title} onChange={(value) => updateList("workHistory", index, "title", value)} /><FormField label="Dates employed" value={job.dates} onChange={(value) => updateList("workHistory", index, "dates", value)} /><FormField label="Supervisor and phone" value={`${job.supervisor}${job.supervisor && job.phone ? " — " : ""}${job.phone}`} onChange={(value) => updateList("workHistory", index, "supervisor", value)} /><div className="md:col-span-2"><FormField label="Reason for leaving" value={job.reason} onChange={(value) => updateList("workHistory", index, "reason", value)} /></div></div>)}</CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Professional References</CardTitle><CardDescription>Do not list relatives.</CardDescription></CardHeader>
        <CardContent className="space-y-4">{form.references.map((reference, index) => <div key={index} className="grid gap-3 rounded-lg border p-4 md:grid-cols-4"><FormField label="Name" value={reference.name} onChange={(value) => updateList("references", index, "name", value)} /><FormField label="Relationship" value={reference.relationship} onChange={(value) => updateList("references", index, "relationship", value)} /><FormField label="Phone" value={reference.phone} onChange={(value) => updateList("references", index, "phone", value)} /><FormField label="Email" value={reference.email} onChange={(value) => updateList("references", index, "email", value)} type="email" /></div>)}</CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Official Government Forms</CardTitle><CardDescription>These documents remain official and unaltered. Open the fillable government PDF, complete it, and download or print your copy.</CardDescription></CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          <GovernmentForm title="Form I-9" description="Employment eligibility verification" href="https://www.uscis.gov/sites/default/files/document/forms/i-9.pdf" />
          <GovernmentForm title="Form W-4" description="For employees: federal tax withholding" href="https://www.irs.gov/pub/irs-pdf/fw4.pdf" />
          <GovernmentForm title="Form W-9" description="For independent contractors only" href="https://www.irs.gov/pub/irs-pdf/fw9.pdf" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Certification and Electronic Signature</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">I certify that the information in this application is true and complete. I authorize verification of the information provided and understand that submitting this application does not guarantee employment.</p>
          <div className="flex items-start gap-2"><Checkbox id="application-certification" checked={acknowledged} onCheckedChange={(checked) => setAcknowledged(Boolean(checked))} /><Label htmlFor="application-certification">I have read and agree to the certification above. *</Label></div>
          <div className="grid gap-4 md:grid-cols-2"><FormField label="Type your full legal name as your signature" value={form.signature} onChange={(value) => update("signature", value)} required /><FormField label="Date signed" value={form.signatureDate} onChange={(value) => update("signatureDate", value)} type="date" required /></div>
          {form.signature && <div className="rounded-lg border bg-muted/30 p-4 text-center"><p className="text-xs text-muted-foreground">Electronic signature</p><p className="mt-2 text-3xl italic text-primary">{form.signature}</p></div>}
        </CardContent>
      </Card>

      <div className="flex flex-wrap justify-end gap-3">
        <Button type="button" variant="outline" onClick={() => generateGuardApplicationPDF(form)}><Download className="mr-2 h-4 w-4" />Preview PDF</Button>
        <Button type="submit" disabled={submitting || !complete}><FileCheck2 className="mr-2 h-4 w-4" />{submitting ? "Submitting…" : applicationId ? "Update Application" : "Submit Application"}</Button>
      </div>
    </form>
  );
}

function GovernmentForm({ title, description, href }: { title: string; description: string; href: string }) {
  return <div className="rounded-lg border p-4"><FileCheck2 className="mb-3 h-6 w-6 text-primary" /><h3 className="font-semibold">{title}</h3><p className="mb-4 text-sm text-muted-foreground">{description}</p><Button asChild variant="outline" className="w-full"><a href={href} target="_blank" rel="noreferrer">Open fillable PDF<ExternalLink className="ml-2 h-4 w-4" /></a></Button></div>;
}
