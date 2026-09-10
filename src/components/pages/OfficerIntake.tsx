import { useState } from "react";
import { CheckCircle2, ShieldCheck, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function OfficerIntake() {
  const [form, setForm] = useState({ fullName: "", email: "", phone: "" });
  const [saving, setSaving] = useState(false);

  const continueToAccount = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const { data, error } = await (supabase as any).rpc("capture_officer_lead", {
        _full_name: form.fullName,
        _email: form.email,
        _phone: form.phone,
        _source: "homepage_officer_intake",
      });
      if (error) throw error;
      const leadId = String(data);
      sessionStorage.setItem(`candidate-lead:${leadId}`, JSON.stringify(form));
      const next = "/dashboard?onboarding=application";
      window.location.assign(`/auth?mode=signup&role=officer&lead=${encodeURIComponent(leadId)}&next=${encodeURIComponent(next)}`);
    } catch (error: any) {
      toast.error(error.message || "We could not save your information");
      setSaving(false);
    }
  };

  return <main className="min-h-screen bg-slate-50">
    <header className="border-b bg-white"><div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-5"><ShieldCheck className="h-8 w-8 text-primary" /><span className="text-xl font-bold">We Find Guards</span></div></header>
    <div className="mx-auto grid max-w-5xl items-start gap-10 px-5 py-10 lg:grid-cols-[1fr_420px] lg:py-16">
      <section className="pt-4">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-2 text-sm font-medium text-primary"><UserRound className="h-4 w-4" />Security professional registration</div>
        <h1 className="mt-6 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">Start your security career profile</h1>
        <p className="mt-5 max-w-xl text-lg leading-8 text-slate-600">Share your contact information first. We’ll save your progress, then ask you to create a secure login before continuing to your hiring application.</p>
        <div className="mt-8 space-y-4 text-slate-700">
          {["Your information is saved before account creation", "Continue directly into the officer application", "Use one profile to connect with hiring companies"].map(item => <div key={item} className="flex items-center gap-3"><CheckCircle2 className="h-5 w-5 text-green-600" /><span>{item}</span></div>)}
        </div>
      </section>
      <Card className="border-primary/20 shadow-xl"><CardContent className="p-6 sm:p-8"><h2 className="text-2xl font-bold">Tell us about you</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">No login is required for this first step.</p>
        <form onSubmit={continueToAccount} className="mt-6 space-y-4">
          <div><Label htmlFor="officer-name">Full name</Label><Input id="officer-name" className="mt-2 h-12" autoComplete="name" value={form.fullName} onChange={event => setForm({ ...form, fullName: event.target.value })} required /></div>
          <div><Label htmlFor="officer-email">Email</Label><Input id="officer-email" className="mt-2 h-12" type="email" autoComplete="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} required /></div>
          <div><Label htmlFor="officer-phone">Mobile phone</Label><Input id="officer-phone" className="mt-2 h-12" type="tel" autoComplete="tel" value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} required /></div>
          <Button className="h-12 w-full text-base" disabled={saving}>{saving ? "Saving…" : "Save and create login"}</Button>
        </form>
        <p className="mt-4 text-xs leading-5 text-muted-foreground">By continuing, you agree that We Find Guards may contact you about your profile and hiring opportunities. A secure account is required to complete and submit an application.</p>
      </CardContent></Card>
    </div>
  </main>;
}
