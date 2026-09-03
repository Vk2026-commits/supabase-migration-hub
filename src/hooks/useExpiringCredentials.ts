import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ExpiringItem {
  id: string;
  name: string;
  type: string;
  expiry_date: string;
  daysLeft: number;
  officerName?: string;
}

const daysUntil = (date: string) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${date}T00:00:00`);
  return Math.ceil((expiry.getTime() - today.getTime()) / 86_400_000);
};

export const useExpiringCredentials = (userId: string, mode: "officer" | "company") => {
  const [items, setItems] = useState<ExpiringItem[]>([]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        let rows: ExpiringItem[] = [];

        if (mode === "officer") {
          const { data: officer } = await supabase
            .from("officer_profiles")
            .select("id")
            .eq("user_id", userId)
            .maybeSingle();
          if (!officer) return;

          const { data } = await supabase
            .from("certifications")
            .select("id, name, certification_type, expiry_date")
            .eq("officer_id", officer.id)
            .not("expiry_date", "is", null);

          rows = (data || [])
            .filter((credential) => credential.expiry_date)
            .map((credential) => ({
              id: credential.id,
              name: credential.name,
              type: credential.certification_type || "credential",
              expiry_date: credential.expiry_date!,
              daysLeft: daysUntil(credential.expiry_date!),
            }))
            .filter((row) => row.daysLeft <= 90);
        } else {
          const { data: company } = await supabase
            .from("company_profiles")
            .select("id")
            .eq("user_id", userId)
            .maybeSingle();
          if (!company) return;

          const { data: hires } = await supabase
            .from("hires")
            .select("officer_id")
            .eq("company_id", company.id);

          const officerIds = [...new Set((hires || []).map((hire) => hire.officer_id))];
          if (officerIds.length === 0) return;

          const [{ data: certifications }, { data: officers }] = await Promise.all([
            supabase
              .from("officer_certifications_safe")
              .select("certification_id, officer_id, name, certification_type, expiry_date")
              .in("officer_id", officerIds)
              .not("expiry_date", "is", null),
            supabase.from("officer_profiles_safe").select("id, user_id").in("id", officerIds),
          ]);

          const userIds = (officers || []).map((officer) => officer.user_id);
          const { data: names } = userIds.length
            ? await supabase.from("public_profiles").select("id, full_name").in("id", userIds)
            : { data: [] };

          const nameByOfficer = new Map<string, string>();
          (officers || []).forEach((officer) => {
            const profile = (names || []).find((name) => name.id === officer.user_id);
            nameByOfficer.set(officer.id, profile?.full_name || "Officer");
          });

          rows = (certifications || [])
            .filter((credential) => credential.officer_id && credential.expiry_date)
            .map((credential) => ({
              id: credential.certification_id,
              name: credential.name || "Credential",
              type: credential.certification_type || "credential",
              expiry_date: credential.expiry_date!,
              daysLeft: daysUntil(credential.expiry_date!),
              officerName: nameByOfficer.get(credential.officer_id!) || "Officer",
            }))
            .filter((row) => row.daysLeft <= 90);
        }

        rows.sort((a, b) => a.daysLeft - b.daysLeft);
        if (!cancelled) setItems(rows);
      } catch {
        // Expiry warnings should never block the rest of the dashboard.
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [userId, mode]);

  return items;
};
