import { supabase } from "@/integrations/supabase/client";

// Only called after the server confirms an explicitly registered test account.
export async function ensureHiringTestAttachments(userId: string, officerId: string) {
  const registry = await (supabase as any).rpc("get_hiring_test_account", { _user_id: userId });
  if (registry.error) throw registry.error;
  if (!registry.data || registry.data.officer_id !== officerId) return;
  const certId = "d17c80ac-7f44-4eea-9179-cd3f56b2d121";
  const path = `${userId}/${certId}-SAMPLE.pdf`;
  const existing = await supabase.from("certifications").select("id,document_front_url").eq("id", certId).maybeSingle();
  if (existing.error) throw existing.error;
  if (!existing.data?.document_front_url) {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF();
    pdf.setFontSize(24); pdf.text("SAMPLE — NOT A VALID LICENSE", 15, 30);
    pdf.setFontSize(14); pdf.text("Kairos Test Officer", 15, 50);
    pdf.text("Synthetic Level III training attachment", 15, 65);
    pdf.text("For application upload testing only. Do not verify or contact.", 15, 80);
    const upload = await supabase.storage.from("certification-documents").upload(path, pdf.output("blob"), { contentType: "application/pdf", upsert: true });
    if (upload.error) throw upload.error;
    const saved = await supabase.from("certifications").upsert({ id: certId, officer_id: officerId, name: "SAMPLE — Test Level III (not a valid credential)", issuing_organization: "Synthetic training provider — do not contact", document_front_url: path, certification_type: "license", license_level: "Level III", certification_number: "SAMPLE-NOT-VALID" } as any);
    if (saved.error) throw saved.error;
  }
}
