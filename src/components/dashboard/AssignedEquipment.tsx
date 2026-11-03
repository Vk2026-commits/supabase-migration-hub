import { KAIROS_EQUIPMENT, isKairos } from "@/lib/kairosWorkflow";
import { Checkbox } from "@/components/ui/checkbox";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export function AssignedEquipment({ companyId, officerId, hireId }: { companyId: string; officerId: string; hireId: string }) {
  const [selectedItems, setSelectedItems] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [legacy, setLegacy] = useState<Record<string, unknown>>({});
  const [item, setItem] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const load = async () => {
    const [result, packets] = await Promise.all([
      (supabase as any).from("company_assigned_equipment").select("*").eq("company_id", companyId).eq("officer_id", officerId).order("created_at", { ascending: false }),
      (supabase as any).from("officer_onboarding_packets").select("form_data").eq("hire_id", hireId).eq("officer_id", officerId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setError(result.error || packets.error ? "Equipment records could not be loaded. Please retry." : "");
    setItems(result.data || []);
    setLoading(false);
    const form = packets.data?.form_data || {};
    setLegacy({ ...(form.issuedItems || {}), ...(form.policyAcknowledgements?.property?.documentFields || {}), ...(form.policyAcknowledgements?.uniform?.documentFields || {}) });
  };
  useEffect(() => { void load(); }, [companyId, officerId, hireId]);
  const add = async () => {
    if (!item.trim()) return;
    setBusy(true);
    const { error } = await (supabase as any).from("company_assigned_equipment").insert({ company_id: companyId, officer_id: officerId, item: item.trim(), identifier: identifier.trim() });
    if (error) toast.error(error.message); else { setItem(""); setIdentifier(""); await load(); toast.success("Equipment assigned"); }
    setBusy(false);
  };
  const assignSelected = async () => {
    if (busy || loading || error || !selectedItems.length) return;
    setBusy(true);
    try {
      const names = selectedItems.filter((name) => !items.some((entry) => entry.item === name && !entry.returned_on));
      if (names.length) {
        const { error: saveError } = await (supabase as any).from("company_assigned_equipment").insert(names.map((name) => ({ company_id: companyId, officer_id: officerId, item: name, identifier: "" })));
        if (saveError) throw saveError;
      }
      setSelectedItems([]);
      await load();
      toast.success("Selected equipment assigned");
    } catch (failure: any) { toast.error(failure.message || "Could not assign equipment"); }
    finally { setBusy(false); }
  };
  const markReturned = async (id: string) => {
    setBusy(true);
    const now = new Date();
    const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const { error } = await (supabase as any).from("company_assigned_equipment").update({ returned_on: localDate }).eq("id", id).eq("company_id", companyId);
    if (error) toast.error(error.message); else await load();
    setBusy(false);
  };
  return <section className="space-y-5"><h2 className="text-xl font-bold">Assigned equipment</h2><p className="text-sm text-muted-foreground">Record company-issued keys, access cards, uniforms, radios, and other equipment.</p>{isKairos(companyId) && <section className="space-y-3 rounded-lg border p-4"><h3 className="font-semibold">Kairos equipment checklist</h3><p className="text-sm text-muted-foreground">Select equipment actually issued, then save the assignment. Add serial numbers using the item form below.</p><div className="grid gap-3 sm:grid-cols-2">{KAIROS_EQUIPMENT.map((name) => { const assigned = items.some((entry) => entry.item === name && !entry.returned_on); return <label key={name} className="flex items-center gap-2 text-sm"><Checkbox checked={assigned || selectedItems.includes(name)} disabled={assigned || busy || loading || !!error} onCheckedChange={(checked) => setSelectedItems(current => checked ? [...current, name] : current.filter(item => item !== name))} />{name}{assigned && <span className="text-xs text-muted-foreground">Assigned</span>}</label>; })}</div><Button type="button" disabled={busy || loading || !!error || !selectedItems.length} onClick={() => void assignSelected()}>Assign selected equipment</Button></section>}{error && <p role="alert">{error} <Button variant="outline" onClick={() => void load()}>Retry</Button></p>}<div className="grid items-end gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_auto]"><div className="space-y-2"><Label htmlFor="equipment-item">Item</Label><Input id="equipment-item" value={item} onChange={(e) => setItem(e.target.value)} placeholder="Building key/card" /></div><div className="space-y-2"><Label htmlFor="equipment-identifier">Serial number / identifier</Label><Input id="equipment-identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} /></div><Button type="button" disabled={busy || !item.trim()} onClick={() => void add()}>Assign equipment</Button></div><div className="divide-y rounded-lg border">{items.map((entry) => <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><strong>{entry.item}</strong><p className="text-sm">{entry.identifier || "No identifier"} · Issued {entry.issued_on}</p></div>{entry.returned_on ? <span className="text-sm">Returned {entry.returned_on}</span> : <Button disabled={busy} variant="outline" onClick={() => void markReturned(entry.id)}>Mark returned</Button>}</div>)}{!items.length && <p className="p-4 text-sm text-muted-foreground">No new equipment assignments recorded.</p>}</div>{Object.entries(legacy).some(([,v]) => Boolean(v)) && <details className="rounded-lg border p-4"><summary className="cursor-pointer font-medium">Previously recorded onboarding equipment</summary><dl className="mt-3 space-y-2">{Object.entries(legacy).filter(([,v]) => Boolean(v)).map(([key,value]) => <div key={key}><dt className="font-medium">{key}</dt><dd>{value === true ? "Issued" : String(value)}</dd></div>)}</dl></details>}</section>;
}
