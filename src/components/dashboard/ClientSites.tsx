import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Archive,
  Building2,
  Clock3,
  MapPin,
  Pencil,
  Plus,
  RotateCcw,
  UserRound,
} from "lucide-react";
import { toast } from "sonner";

type ClientSitesProps = { companyId: string; canManage: boolean };

const dayOptions = [
  ["monday", "Mon"],
  ["tuesday", "Tue"],
  ["wednesday", "Wed"],
  ["thursday", "Thu"],
  ["friday", "Fri"],
  ["saturday", "Sat"],
  ["sunday", "Sun"],
];

const timeOptions = Array.from({ length: 96 }, (_, index) => {
  const hour = Math.floor(index / 4);
  const minute = (index % 4) * 15;
  const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const label = new Date(2000, 0, 1, hour, minute).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });
  return { value, label };
});

const emptySite = () => ({
  site_name: "",
  client_name: "",
  address_street: "",
  address_unit: "",
  address_city: "",
  address_state: "Texas",
  address_zip: "",
  supervisor_name: "",
  site_contact_name: "",
  site_contact_phone: "",
  shift_days: ["monday", "tuesday", "wednesday", "thursday", "friday"],
  shift_start_time: "07:00",
  shift_end_time: "15:00",
  expected_weekly_hours: "40",
  schedule_notes: "",
});

const timeLabel = (value: string) =>
  timeOptions.find((item) => item.value === String(value || "").slice(0, 5))?.label || value;

export default function ClientSites({ companyId, canManage }: ClientSitesProps) {
  const [sites, setSites] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState(emptySite);

  const loadSites = async () => {
    setLoading(true);
    const { data, error } = await (supabase as any)
      .from("company_client_sites")
      .select("*")
      .eq("company_id", companyId)
      .order("is_active", { ascending: false })
      .order("site_name");
    if (error) toast.error(error.message || "Client sites could not be loaded");
    setSites(data || []);
    setLoading(false);
  };

  useEffect(() => {
    void loadSites();
  }, [companyId]);

  const startNew = () => {
    setEditing(null);
    setForm(emptySite());
    setOpen(true);
  };
  const startEdit = (site: any) => {
    setEditing(site);
    setForm({
      site_name: site.site_name || "",
      client_name: site.client_name || "",
      address_street: site.address_street || "",
      address_unit: site.address_unit || "",
      address_city: site.address_city || "",
      address_state: site.address_state || "Texas",
      address_zip: site.address_zip || "",
      supervisor_name: site.supervisor_name || "",
      site_contact_name: site.site_contact_name || "",
      site_contact_phone: site.site_contact_phone || "",
      shift_days: site.shift_days || [],
      shift_start_time: String(site.shift_start_time || "07:00").slice(0, 5),
      shift_end_time: String(site.shift_end_time || "15:00").slice(0, 5),
      expected_weekly_hours: String(site.expected_weekly_hours || ""),
      schedule_notes: site.schedule_notes || "",
    });
    setOpen(true);
  };

  const toggleDay = (day: string, checked: boolean) =>
    setForm((current) => ({
      ...current,
      shift_days: checked
        ? [...current.shift_days, day]
        : current.shift_days.filter((item) => item !== day),
    }));

  const save = async () => {
    const required = [
      form.site_name,
      form.client_name,
      form.address_street,
      form.address_city,
      form.address_state,
      form.address_zip,
      form.supervisor_name,
    ];
    if (
      required.some((value) => !value.trim()) ||
      !form.shift_days.length ||
      !form.expected_weekly_hours
    ) {
      toast.error("Complete the site, address, supervisor, schedule days, and weekly hours");
      return;
    }
    setSaving(true);
    const payload = {
      ...form,
      company_id: companyId,
      expected_weekly_hours: Number(form.expected_weekly_hours),
    };
    const query = editing
      ? (supabase as any)
          .from("company_client_sites")
          .update(payload)
          .eq("id", editing.id)
          .eq("company_id", companyId)
      : (supabase as any).from("company_client_sites").insert(payload);
    const { error } = await query;
    setSaving(false);
    if (error) {
      toast.error(error.message || "Client site could not be saved");
      return;
    }
    toast.success(editing ? "Client site updated" : "Client site added");
    setOpen(false);
    await loadSites();
  };

  const setActive = async (site: any, isActive: boolean) => {
    const { error } = await (supabase as any)
      .from("company_client_sites")
      .update({ is_active: isActive })
      .eq("id", site.id)
      .eq("company_id", companyId);
    if (error) {
      toast.error(error.message || "Site status could not be changed");
      return;
    }
    toast.success(isActive ? "Client site restored" : "Client site archived");
    await loadSites();
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-2xl font-bold">Client sites</h2>
          <p className="mt-1 text-muted-foreground">
            Save each client location and its standard shift once, then select it while preparing an
            offer.
          </p>
        </div>
        {canManage && (
          <Button onClick={startNew}>
            <Plus className="mr-2 h-4 w-4" />
            Add client site
          </Button>
        )}
      </div>

      {loading ? (
        <Card>
          <CardContent className="p-10 text-center text-muted-foreground">
            Loading client sites…
          </CardContent>
        </Card>
      ) : sites.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center p-12 text-center">
            <div className="rounded-2xl bg-primary/10 p-4">
              <Building2 className="h-8 w-8 text-primary" />
            </div>
            <h3 className="mt-4 text-lg font-semibold">No client sites saved yet</h3>
            <p className="mt-1 max-w-lg text-sm text-muted-foreground">
              Add a client property, address, supervisor, and recurring shift. It will then appear
              in the employment-offer dropdown.
            </p>
            {canManage && (
              <Button className="mt-5" onClick={startNew}>
                <Plus className="mr-2 h-4 w-4" />
                Add your first site
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="overflow-hidden border bg-background">
          <div className="hidden grid-cols-[minmax(220px,1fr)_minmax(260px,1.2fr)_minmax(220px,1fr)_auto] gap-4 border-b bg-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:grid">
            <span>Site</span><span>Address</span><span>Schedule</span><span>Actions</span>
          </div>
          {sites.map((site) => (
            <div key={site.id} className={`grid gap-3 border-b px-4 py-3 last:border-b-0 hover:bg-slate-50/70 lg:grid-cols-[minmax(220px,1fr)_minmax(260px,1.2fr)_minmax(220px,1fr)_auto] lg:items-center lg:gap-4 ${!site.is_active ? "opacity-65" : ""}`}>
              <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="truncate font-semibold">{site.site_name}</p><Badge variant={site.is_active ? "default" : "secondary"}>{site.is_active ? "Active" : "Archived"}</Badge></div><p className="truncate text-sm text-muted-foreground">{site.client_name}</p></div>
              <p className="flex items-start gap-2 text-sm text-muted-foreground">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0" />
                  <span className="line-clamp-2">
                    {[
                      site.address_street,
                      site.address_unit,
                      site.address_city,
                      site.address_state,
                      site.address_zip,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
              </p>
              <div className="text-sm text-muted-foreground"><p className="flex items-start gap-2"><Clock3 className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    {(site.shift_days || []).map((day: string) => day.slice(0, 3)).join(", ")} ·{" "}
                    {timeLabel(site.shift_start_time)}–{timeLabel(site.shift_end_time)} ·{" "}
                    {Number(site.expected_weekly_hours)} hrs/week
                    {site.schedule_notes ? ` · ${site.schedule_notes}` : ""}
                  </span></p><p className="mt-1 truncate text-xs">Supervisor: {site.supervisor_name}</p></div>
                {canManage && (
                  <div className="flex gap-2 lg:justify-end">
                    <Button size="sm" variant="outline" onClick={() => startEdit(site)}>
                      <Pencil className="mr-2 h-4 w-4" />
                      Edit
                    </Button>
                    {site.is_active ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void setActive(site, false)}
                      >
                        <Archive className="mr-2 h-4 w-4" />
                        Archive
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void setActive(site, true)}
                      >
                        <RotateCcw className="mr-2 h-4 w-4" />
                        Restore
                      </Button>
                    )}
                  </div>
                )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit client site" : "Add client site"}</DialogTitle>
            <DialogDescription>
              These values will prefill the worksite and schedule section of a new employment offer.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-2">
            <section className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Site name"
                value={form.site_name}
                onChange={(value) => setForm({ ...form, site_name: value })}
                placeholder="Downtown Office Tower"
              />
              <Field
                label="Client name"
                value={form.client_name}
                onChange={(value) => setForm({ ...form, client_name: value })}
                placeholder="Acme Properties"
              />
            </section>
            <section className="space-y-4 rounded-xl border p-4">
              <h3 className="font-semibold">Site address</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Street address"
                  value={form.address_street}
                  onChange={(value) => setForm({ ...form, address_street: value })}
                />
                <Field
                  label="Suite / unit (optional)"
                  value={form.address_unit}
                  onChange={(value) => setForm({ ...form, address_unit: value })}
                />
                <Field
                  label="City"
                  value={form.address_city}
                  onChange={(value) => setForm({ ...form, address_city: value })}
                />
                <Field
                  label="State"
                  value={form.address_state}
                  onChange={(value) => setForm({ ...form, address_state: value })}
                />
                <Field
                  label="ZIP code"
                  value={form.address_zip}
                  onChange={(value) => setForm({ ...form, address_zip: value })}
                />
              </div>
            </section>
            <section className="space-y-4 rounded-xl border p-4">
              <h3 className="font-semibold">Contacts</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field
                  label="Officer supervisor"
                  value={form.supervisor_name}
                  onChange={(value) => setForm({ ...form, supervisor_name: value })}
                />
                <Field
                  label="Client site contact (optional)"
                  value={form.site_contact_name}
                  onChange={(value) => setForm({ ...form, site_contact_name: value })}
                />
                <Field
                  label="Site contact phone (optional)"
                  value={form.site_contact_phone}
                  onChange={(value) => setForm({ ...form, site_contact_phone: value })}
                />
              </div>
            </section>
            <section className="space-y-4 rounded-xl border p-4">
              <h3 className="font-semibold">Standard shift</h3>
              <div>
                <Label>Scheduled days *</Label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {dayOptions.map(([value, label]) => (
                    <label
                      key={value}
                      className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"
                    >
                      <Checkbox
                        checked={form.shift_days.includes(value)}
                        onCheckedChange={(checked) => toggleDay(value, Boolean(checked))}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                <TimeField
                  label="Start time"
                  value={form.shift_start_time}
                  onChange={(value) => setForm({ ...form, shift_start_time: value })}
                />
                <TimeField
                  label="End time"
                  value={form.shift_end_time}
                  onChange={(value) => setForm({ ...form, shift_end_time: value })}
                />
                <Field
                  label="Weekly hours"
                  type="number"
                  value={form.expected_weekly_hours}
                  onChange={(value) => setForm({ ...form, expected_weekly_hours: value })}
                />
              </div>
              <div>
                <Label htmlFor="site-schedule-notes">Schedule notes (optional)</Label>
                <Textarea
                  id="site-schedule-notes"
                  className="mt-2"
                  value={form.schedule_notes}
                  onChange={(event) => setForm({ ...form, schedule_notes: event.target.value })}
                  placeholder="Rotation, reporting instructions, or shift expectations"
                />
              </div>
            </section>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={saving}>
              {saving ? "Saving…" : editing ? "Save changes" : "Add site"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder = "",
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  const id = `site-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>
        {label}
        {!label.includes("optional") && " *"}
      </Label>
      <Input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function TimeField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label} *</Label>
      <select
        className="h-12 w-full rounded-md border bg-background px-3"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {timeOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
