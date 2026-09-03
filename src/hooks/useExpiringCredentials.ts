import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface ExpiringCredential {
  id: string;
  officerId: string;
  officerName: string;
  credentialName: string;
  expiryDate: string;
  daysLeft: number;
}

export function useExpiringCredentials(userId: string, mode: "officer" | "company") {
  const [credentials, setCredentials] = useState<ExpiringCredential[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const daysUntil = (date: string) => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const expires = new Date(`${date}T00:00:00`);
      return Math.ceil((expires.getTime() - today.getTime()) / 86_400_000);
    };

    const load = async () => {
      setLoading(true);
      try {
        if (mode === "officer") {
          const { data: officer, error: officerError } = await supabase
            .from("officer_profiles")
            .select("id")
            .eq("user_id", userId)
            .maybeSingle();
          if (officerError) throw officerError;

          if (!officer) {
            if (!cancelled) setCredentials([]);
            return;
          }

          const { data, error } = await supabase
            .from("certifications")
            .select("id, officer_id, name, expiry_date")
            .eq("officer_id", officer.id)
            .not("expiry_date", "is", null);
          if (error) throw error;

          const items = (data ?? [])
            .map((credential) => ({
              id: credential.id,
              officerId: credential.officer_id,
              officerName: "You",
              credentialName: credential.name,
              expiryDate: credential.expiry_date!,
              daysLeft: daysUntil(credential.expiry_date!),
            }))
            .filter((credential) => credential.daysLeft <= 90)
            .sort((a, b) => a.daysLeft - b.daysLeft);

          if (!cancelled) setCredentials(items);
          return;
        }

        const { data: company, error: companyError } = await supabase
          .from("company_profiles")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();
        if (companyError) throw companyError;

        if (!company) {
          if (!cancelled) setCredentials([]);
          return;
        }

        const { data: hires, error: hiresError } = await supabase
          .from("hires")
          .select("officer_id")
          .eq("company_id", company.id);
        if (hiresError) throw hiresError;

        const officerIds = [...new Set((hires ?? []).map((hire) => hire.officer_id))];
        if (officerIds.length === 0) {
          if (!cancelled) setCredentials([]);
          return;
        }

        const { data: certificationData, error: certificationError } = await supabase
          .from("officer_certifications_safe")
          .select("certification_id, officer_id, name, expiry_date")
          .in("officer_id", officerIds)
          .not("expiry_date", "is", null);
        if (certificationError) throw certificationError;

        const { data: officerData, error: officerProfilesError } = await supabase
          .from("officer_profiles_safe")
          .select("id, user_id")
          .in("id", officerIds);
        if (officerProfilesError) throw officerProfilesError;

        const userIds = (officerData ?? []).map((officer) => officer.user_id);
        const { data: publicProfiles, error: publicProfilesError } = userIds.length
          ? await supabase.from("public_profiles").select("id, full_name").in("id", userIds)
          : { data: [], error: null };
        if (publicProfilesError) throw publicProfilesError;

        const userIdByOfficerId = new Map(
          (officerData ?? []).map((officer) => [officer.id, officer.user_id]),
        );
        const nameByUserId = new Map(
          (publicProfiles ?? []).map((profile) => [profile.id, profile.full_name]),
        );
        const items = (certificationData ?? [])
          .filter((credential) => credential.officer_id && credential.expiry_date)
          .map((credential) => ({
            id: credential.certification_id,
            officerId: credential.officer_id!,
            officerName:
              nameByUserId.get(userIdByOfficerId.get(credential.officer_id!) ?? "") ||
              "Security Officer",
            credentialName: credential.name || "Credential",
            expiryDate: credential.expiry_date!,
            daysLeft: daysUntil(credential.expiry_date!),
          }))
          .filter((credential) => credential.daysLeft <= 90)
          .sort((a, b) => a.daysLeft - b.daysLeft);

        if (!cancelled) setCredentials(items);
      } catch (error) {
        console.error("Failed to load expiring credentials:", error);
        if (!cancelled) setCredentials([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [mode, userId]);

  return { credentials, loading };
}
