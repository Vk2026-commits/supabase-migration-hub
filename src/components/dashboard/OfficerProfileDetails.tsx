import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function OfficerProfileDetails({ officerId }: { officerId: string }) {
  const [profile, setProfile] = useState<any>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setProfile(null); setError("");
    supabase.from("officer_profiles").select("title,bio,location,years_experience,availability_status,employment_type,shift_preference").eq("id", officerId).single().then(({ data, error }) => {
      if (active) { setProfile(data); setError(error ? "The officer profile could not be loaded." : ""); }
    });
    return () => { active = false; };
  }, [officerId]);
  if (error) return <p role="alert">{error}</p>;
  if (!profile) return <p>Loading officer profile…</p>;
  return <div className="max-w-4xl space-y-5"><h2 className="text-xl font-bold">Officer profile</h2><p className="whitespace-pre-line">{profile.bio || "This officer has not added a biography yet."}</p><dl className="grid gap-4 sm:grid-cols-2">{[["Title", profile.title], ["Location", profile.location], ["Experience", profile.years_experience == null ? "" : `${profile.years_experience} years`], ["Availability", profile.availability_status], ["Employment preferences", profile.employment_type?.join(", ")], ["Shift preferences", profile.shift_preference?.join(", ")]].map(([label, value]) => <div key={label} className="rounded-lg border p-4"><dt className="text-sm text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value || "Not provided"}</dd></div>)}</dl><a className="inline-block text-primary underline" href={`/browse?officerId=${encodeURIComponent(officerId)}`}>View full profile, certifications, and work history</a></div>;
}
