import { Dispatch, SetStateAction, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Building2, Check, Cloud, FileCheck2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export type CompanyProfileForm = {
  company_name: string;
  industry: string;
  company_size: string;
  website_url: string;
  linkedin_url: string;
  facebook_url: string;
  twitter_url: string;
  instagram_url: string;
  contact_person_name: string;
  contact_person_title: string;
  contact_person_position: string;
  company_phone: string;
  company_phone_ext: string;
  contact_cell_phone: string;
  contact_email: string;
  license_number: string;
  licensed_states: string[];
  license_types: string[];
  years_in_business: string;
  year_founded: string;
  logo_url: string;
};

type Props = {
  formData: CompanyProfileForm;
  setFormData: Dispatch<SetStateAction<CompanyProfileForm>>;
  logoFile: File | null;
  setLogoFile: Dispatch<SetStateAction<File | null>>;
  loading: boolean;
  uploadingLogo: boolean;
  onSave: () => Promise<boolean>;
  onBrowse: () => void;
};

const steps = [
  ["Company basics", "Tell officers who you are"],
  ["Brand and website", "Add your logo and online presence"],
  ["Hiring contact", "Who should applicants contact?"],
  ["Licensing", "Share where your company operates"],
  ["Review", "Confirm and save your profile"],
];

const Field = ({ label, value, onChange, type = "text", placeholder = "", required = false }: { label: string; value: string; onChange: (value: string) => void; type?: string; placeholder?: string; required?: boolean }) => (
  <div className="space-y-2">
    <Label>{label}{required ? " *" : ""}</Label>
    <Input className="h-12 text-base" type={type} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
  </div>
);

export function CompanyProfileWizard({ formData, setFormData, logoFile, setLogoFile, loading, uploadingLogo, onSave, onBrowse }: Props) {
  const [currentStep, setCurrentStep] = useState(0);
  const update = <K extends keyof CompanyProfileForm>(key: K, value: CompanyProfileForm[K]) => setFormData((current) => ({ ...current, [key]: value }));
  const stepComplete = (step: number) => step === 0
    ? Boolean(formData.company_name.trim())
    : step === 1
      ? Boolean(formData.logo_url || logoFile || formData.website_url.trim())
      : step === 2
        ? Boolean(formData.contact_person_name.trim() && formData.contact_email.trim())
        : step === 3
          ? Boolean(formData.license_number.trim() || formData.licensed_states.length)
          : Boolean(formData.company_name.trim() && formData.contact_person_name.trim() && formData.contact_email.trim());
  const canContinue = currentStep === 0 || currentStep === 2 ? stepComplete(currentStep) : true;
  const completedCount = useMemo(() => steps.filter((_, index) => stepComplete(index)).length, [formData]);
  const progress = Math.round(((currentStep + 1) / steps.length) * 100);
  const go = (step: number) => {
    setCurrentStep(Math.max(0, Math.min(steps.length - 1, step)));
    requestAnimationFrame(() => document.getElementById("company-profile-top")?.scrollIntoView({ behavior: "auto", block: "start" }));
  };
  const next = async () => {
    if (!canContinue) {
      toast.error(currentStep === 0 ? "Enter your company name before continuing" : "Enter the hiring contact name and email before continuing");
      return;
    }
    if (await onSave()) go(currentStep + 1);
  };
  const finish = async () => {
    if (await onSave()) {
      toast.success("Company profile is ready");
      onBrowse();
    }
  };

  return (
    <div id="company-profile-top" className="mx-auto w-full max-w-6xl scroll-mt-20 pb-24 lg:pb-8">
      <div className="mb-6 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-background to-background">
        <div className="flex items-center gap-3 px-5 py-5 sm:px-8">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><Building2 className="h-7 w-7" /></div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-[.18em] text-primary">We Find Guards</p>
            <h2 className="text-xl font-bold sm:text-2xl">Build your company profile</h2>
            <p className="mt-1 text-sm text-muted-foreground">A strong profile helps qualified officers understand who they will work for.</p>
          </div>
          <span className="hidden items-center gap-1 text-xs text-muted-foreground sm:flex"><Cloud className="h-4 w-4" />Saved as you continue</span>
        </div>
        <div className="h-2 bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} /></div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[250px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <nav className="sticky top-20 space-y-1 rounded-2xl border bg-card p-3">
            {steps.map((step, index) => (
              <button key={step[0]} type="button" onClick={() => go(index)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${index === currentStep ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>
                <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${index === currentStep ? "bg-white/20" : stepComplete(index) ? "bg-primary text-primary-foreground" : "bg-muted"}`}>{stepComplete(index) && index !== currentStep ? <Check className="h-4 w-4" /> : index + 1}</span>
                <span className="min-w-0"><span className="block text-sm font-semibold">{step[0]}</span><span className={`block truncate text-xs ${index === currentStep ? "text-white/75" : "text-muted-foreground"}`}>{step[1]}</span></span>
              </button>
            ))}
          </nav>
        </aside>

        <main className="min-w-0">
          <div className="mb-4 flex justify-between lg:hidden"><span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">Step {currentStep + 1} of {steps.length}</span><span className="text-sm text-muted-foreground">{progress}% complete</span></div>
          <Card className="rounded-2xl shadow-sm">
            <CardHeader className="border-b px-5 py-6 sm:px-8"><CardTitle className="text-2xl sm:text-3xl">{steps[currentStep][0]}</CardTitle><CardDescription className="text-base">{steps[currentStep][1]}</CardDescription></CardHeader>
            <CardContent className="px-5 py-7 sm:px-8 sm:py-9">
              {currentStep === 0 && <div className="grid gap-5 md:grid-cols-2">
                <Field label="Company name" value={formData.company_name} onChange={(value) => update("company_name", value)} placeholder="Acme Security Services" required />
                <Field label="Industry" value={formData.industry} onChange={(value) => update("industry", value)} placeholder="Commercial Security" />
                <div className="space-y-2"><Label>Company size</Label><Select value={formData.company_size} onValueChange={(value) => update("company_size", value)}><SelectTrigger className="h-12 text-base"><SelectValue placeholder="Select company size" /></SelectTrigger><SelectContent>{["1-50", "50-100", "100-200", "200-300", "300-400", "400+"].map((value) => <SelectItem key={value} value={value}>{value} employees</SelectItem>)}</SelectContent></Select></div>
                <div className="space-y-2"><Label>Years in business</Label><Select value={formData.years_in_business} onValueChange={(value) => update("years_in_business", value)}><SelectTrigger className="h-12 text-base"><SelectValue placeholder="Select years in business" /></SelectTrigger><SelectContent><SelectItem value="0-1">Less than 1 year</SelectItem><SelectItem value="1-3">1-3 years</SelectItem><SelectItem value="3-5">3-5 years</SelectItem><SelectItem value="5-10">5-10 years</SelectItem><SelectItem value="10-20">10-20 years</SelectItem><SelectItem value="20+">20+ years</SelectItem></SelectContent></Select></div>
                <Field label="Year founded" value={formData.year_founded} onChange={(value) => update("year_founded", value)} type="number" placeholder="2005" />
              </div>}

              {currentStep === 1 && <div className="space-y-7">
                <div className="space-y-3"><Label className="text-base">Company logo</Label><label className="flex min-h-36 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-primary/25 bg-primary/5 p-6 text-center hover:border-primary/50"><Upload className="mb-3 h-7 w-7 text-primary" /><span className="font-semibold">{logoFile ? logoFile.name : formData.logo_url ? "Choose a new logo" : "Upload your company logo"}</span><span className="mt-1 text-sm text-muted-foreground">PNG, JPG, or WebP</span><Input className="sr-only" type="file" accept="image/*" onChange={(event) => setLogoFile(event.target.files?.[0] || null)} disabled={uploadingLogo} /></label>{formData.logo_url && <img src={formData.logo_url} alt="Company logo" className="h-20 w-20 rounded-xl border object-contain p-1" />}</div>
                <div className="grid gap-5 md:grid-cols-2"><Field label="Website" type="url" value={formData.website_url} onChange={(value) => update("website_url", value)} placeholder="https://example.com" /><Field label="LinkedIn" type="url" value={formData.linkedin_url} onChange={(value) => update("linkedin_url", value)} /><Field label="Facebook" type="url" value={formData.facebook_url} onChange={(value) => update("facebook_url", value)} /><Field label="X / Twitter" type="url" value={formData.twitter_url} onChange={(value) => update("twitter_url", value)} /><Field label="Instagram" type="url" value={formData.instagram_url} onChange={(value) => update("instagram_url", value)} /></div>
              </div>}

              {currentStep === 2 && <div className="space-y-5"><p className="rounded-xl bg-primary/5 p-4 text-sm text-muted-foreground">This person will receive and manage applicant communication for your company.</p><div className="grid gap-5 md:grid-cols-2"><Field label="Contact person name" value={formData.contact_person_name} onChange={(value) => update("contact_person_name", value)} placeholder="John Doe" required /><Field label="Contact email" type="email" value={formData.contact_email} onChange={(value) => update("contact_email", value)} placeholder="hiring@company.com" required /><Field label="Title" value={formData.contact_person_title} onChange={(value) => update("contact_person_title", value)} placeholder="HR Manager" /><Field label="Position at company" value={formData.contact_person_position} onChange={(value) => update("contact_person_position", value)} placeholder="Director of Operations" /><Field label="Company phone" type="tel" value={formData.company_phone} onChange={(value) => update("company_phone", value)} placeholder="(555) 123-4567" /><Field label="Extension" value={formData.company_phone_ext} onChange={(value) => update("company_phone_ext", value)} /><Field label="Cell phone" type="tel" value={formData.contact_cell_phone} onChange={(value) => update("contact_cell_phone", value)} /></div></div>}

              {currentStep === 3 && <div className="space-y-7"><div className="grid gap-5 md:grid-cols-2"><Field label="Company license number" value={formData.license_number} onChange={(value) => update("license_number", value)} placeholder="A12345" /><div className="space-y-2"><Label>Licensed states</Label><Input className="h-12 text-base" value={formData.licensed_states.join(", ")} placeholder="TX, CA, FL" onChange={(event) => update("licensed_states", event.target.value.split(",").map((state) => state.trim().toUpperCase()).filter(Boolean))} /><p className="text-xs text-muted-foreground">Enter state abbreviations separated by commas.</p></div></div><div className="space-y-3"><Label className="text-base">Texas security license type(s)</Label>{[["Class A", "Private Investigation Company"], ["Class B", "Security Contractor Company"], ["Class C", "Investigations and Security Contractor Company"]].map(([value, description]) => <label key={value} className="flex cursor-pointer items-start gap-3 rounded-xl border p-4 hover:bg-muted/40"><Checkbox checked={formData.license_types.includes(value)} onCheckedChange={(checked) => update("license_types", checked ? [...formData.license_types, value] : formData.license_types.filter((item) => item !== value))} /><span><span className="block font-semibold">{value}</span><span className="text-sm text-muted-foreground">{description}</span></span></label>)}</div></div>}

              {currentStep === 4 && <div className="space-y-6"><div className="rounded-2xl border border-primary/20 bg-primary/5 p-5"><p className="text-xs font-semibold uppercase tracking-[.16em] text-primary">Company profile</p><h3 className="mt-2 text-2xl font-bold">{formData.company_name || "Company name not entered"}</h3><p className="mt-1 text-muted-foreground">{formData.industry || "Security services"}{formData.licensed_states.length ? ` · Licensed in ${formData.licensed_states.join(", ")}` : ""}</p></div><div className="grid gap-4 sm:grid-cols-2"><Review label="Hiring contact" value={formData.contact_person_name || "Not entered"} /><Review label="Contact email" value={formData.contact_email || "Not entered"} /><Review label="Company phone" value={formData.company_phone || "Not entered"} /><Review label="License number" value={formData.license_number || "Not entered"} /></div><div className="rounded-xl bg-muted/40 p-4 text-sm"><p className="font-semibold">Profile progress</p><p className="mt-1 text-muted-foreground">{completedCount} of {steps.length} sections ready. You can return anytime to update these details.</p></div></div>}
            </CardContent>
          </Card>

          <div className="mt-5 hidden items-center justify-between lg:flex"><Button type="button" variant="outline" onClick={() => go(currentStep - 1)} disabled={!currentStep}><ArrowLeft className="mr-2 h-4 w-4" />Back</Button>{currentStep < steps.length - 1 ? <Button type="button" onClick={next} disabled={loading || uploadingLogo}>{loading || uploadingLogo ? "Saving…" : "Save and continue"}<ArrowRight className="ml-2 h-4 w-4" /></Button> : <Button type="button" onClick={finish} disabled={loading || !stepComplete(0) || !stepComplete(2)}><FileCheck2 className="mr-2 h-4 w-4" />{loading ? "Saving…" : "Finish profile"}</Button>}</div>
        </main>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 flex gap-3 border-t bg-background/95 p-3 shadow-xl backdrop-blur lg:hidden"><Button type="button" variant="outline" size="lg" onClick={() => go(currentStep - 1)} disabled={!currentStep}><ArrowLeft className="h-5 w-5" /></Button>{currentStep < steps.length - 1 ? <Button type="button" size="lg" className="flex-1" onClick={next} disabled={loading || uploadingLogo}>{loading || uploadingLogo ? "Saving…" : "Save and continue"}<ArrowRight className="ml-2 h-5 w-5" /></Button> : <Button type="button" size="lg" className="flex-1" onClick={finish} disabled={loading || !stepComplete(0) || !stepComplete(2)}><FileCheck2 className="mr-2 h-5 w-5" />{loading ? "Saving…" : "Finish profile"}</Button>}</div>
    </div>
  );
}

function Review({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border p-4"><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value}</p></div>;
}
