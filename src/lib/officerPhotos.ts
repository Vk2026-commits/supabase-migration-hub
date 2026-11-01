import { supabase } from "@/integrations/supabase/client";

type PhotoListing = { data: { name: string }[] | null; error: Error | null };
// Share concurrent reads from the dashboard, application, and photo panel.
// Do not persist private paths or signed URLs in browser storage.
const pending = new Map<string, Promise<PhotoListing>>();
export function listOfficerPhotos(userId: string): Promise<PhotoListing> {
  const existing = pending.get(userId);
  if (existing) return existing;
  const request = (async (): Promise<PhotoListing> => {
    try {
      const { data: session } = await supabase.auth.getSession();
      if (session.session?.user.id !== userId) throw new Error("Photo account does not match the signed-in user");
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const { data, error } = await (supabase as any).rpc("get_my_officer_photos").abortSignal(controller.signal);
        if (error) throw error;
        return { data: data || [], error: null };
      } finally { clearTimeout(timer); }
    } catch (error) {
      return { data: null, error: error instanceof Error ? error : new Error("Could not load photo records") };
    } finally { pending.delete(userId); }
  })();
  pending.set(userId, request);
  return request;
}
