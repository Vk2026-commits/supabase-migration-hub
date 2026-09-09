import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckCircle2, Save, Upload, X } from "lucide-react";

interface OfficerPhotosProps {
  userId: string;
  embedded?: boolean;
  onChanged?: (photos: Record<string, string>) => void;
  onSaved?: (complete: boolean) => void;
}

const PHOTO_TYPES = [
  { id: "headshot", label: "Professional Headshot", description: "Close-up portrait photo" },
  { id: "full-body", label: "Full Body Shot", description: "Full body in uniform" },
  { id: "action-1", label: "Action Shot 1", description: "On duty or training" },
  { id: "action-2", label: "Action Shot 2", description: "On duty or training" },
];

export function OfficerPhotos({ userId, embedded = false, onChanged, onSaved }: OfficerPhotosProps) {
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);
  const [savingPhotos, setSavingPhotos] = useState(false);
  const [photosConfirmed, setPhotosConfirmed] = useState(false);

  const requiredPhotosComplete = Boolean(photos.headshot && photos["full-body"]);

  useEffect(() => {
    void loadPhotos(true);
  }, [userId]);

  const loadPhotos = async (confirmExisting = false) => {
    try {
      const { data, error } = await supabase.storage
        .from("officer-photos")
        .list(userId, {
          limit: 100,
          offset: 0,
        });

      if (error) throw error;

      const files = data || [];
      if (confirmExisting) {
        const storedTypes = files.map((file) => file.name.split(".")[0]);
        const complete = storedTypes.includes("headshot") && storedTypes.includes("full-body");
        setPhotosConfirmed(complete);
        onSaved?.(complete);
      }

      // Generate private photo URLs in parallel so completion does not wait on
      // several sequential storage requests.
      const signedPhotos = await Promise.all(files.map(async (file) => {
        const photoType = file.name.split(".")[0];
        const { data: signedData, error: signedError } = await supabase.storage
          .from("officer-photos")
          .createSignedUrl(`${userId}/${file.name}`, 3600); // 1 hour expiry
        return !signedError && signedData ? [photoType, signedData.signedUrl] as const : null;
      }));
      const photoUrls = Object.fromEntries(signedPhotos.filter((photo): photo is readonly [string, string] => Boolean(photo)));

      setPhotos(photoUrls);
      onChanged?.(photoUrls);
      return photoUrls;
    } catch (error: any) {
      console.error("Error loading photos:", error);
      return null;
    }
  };

  const uploadPhoto = async (event: React.ChangeEvent<HTMLInputElement>, photoType: string) => {
    try {
      setUploading(photoType);

      if (!event.target.files || event.target.files.length === 0) {
        return;
      }

      const file = event.target.files[0];
      setPhotosConfirmed(false);
      onSaved?.(false);
      
      // Validate file size (5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error("File size must be less than 5MB");
        return;
      }

      const fileExt = file.name.split(".").pop();
      const filePath = `${userId}/${photoType}.${fileExt}`;

      // Delete old photo if exists
      if (photos[photoType]) {
        const { data: existingFiles } = await supabase.storage.from("officer-photos").list(userId);
        const oldPaths = (existingFiles || []).filter((item) => item.name.startsWith(`${photoType}.`)).map((item) => `${userId}/${item.name}`);
        if (oldPaths.length) await supabase.storage.from("officer-photos").remove(oldPaths);
      }

      const { error: uploadError } = await supabase.storage
        .from("officer-photos")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      toast.success("Photo uploaded successfully!");
      void loadPhotos();
    } catch (error: any) {
      toast.error("Error uploading photo: " + error.message);
    } finally {
      setUploading(null);
    }
  };

  const deletePhoto = async (photoType: string) => {
    try {
      setPhotosConfirmed(false);
      onSaved?.(false);
      const { data: files } = await supabase.storage
        .from("officer-photos")
        .list(userId);

      const fileToDelete = files?.find((f) => f.name.startsWith(photoType));
      
      if (fileToDelete) {
        const { error } = await supabase.storage
          .from("officer-photos")
          .remove([`${userId}/${fileToDelete.name}`]);

        if (error) throw error;

        toast.success("Photo deleted successfully!");
        void loadPhotos();
      }
    } catch (error: any) {
      toast.error("Error deleting photo: " + error.message);
    }
  };

  const savePhotos = async () => {
    setSavingPhotos(true);
    try {
      const savedPhotos = await loadPhotos();
      if (!savedPhotos?.headshot || !savedPhotos["full-body"]) {
        setPhotosConfirmed(false);
        toast.error("Upload both a professional headshot and a full-body photo to complete this step");
        return;
      }
      setPhotosConfirmed(true);
      onSaved?.(true);
      toast.success("Photos saved. Step 8 is complete.");
    } finally {
      setSavingPhotos(false);
    }
  };

  const content = (
    <>
      {!embedded && <CardHeader className="border-b px-5 py-6 sm:px-8">
        <CardTitle className="text-2xl">Photo checklist</CardTitle>
        <CardDescription className="text-base">Complete the required photos first, then add optional action shots if you want.</CardDescription>
      </CardHeader>}
      <CardContent className={embedded ? "px-0" : "px-5 py-7 sm:px-8 sm:py-9"}>
        {embedded && <p className="mb-5 text-sm text-muted-foreground">Your headshot and full-body photo are required. Action photos are optional.</p>}
        <div className={`mb-6 flex items-start gap-3 rounded-xl border p-4 ${requiredPhotosComplete ? "border-green-200 bg-green-50 text-green-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
          <CheckCircle2 className={`mt-0.5 h-5 w-5 shrink-0 ${requiredPhotosComplete ? "text-green-600" : "text-amber-500"}`} />
          <div>
            <p className="font-semibold">{requiredPhotosComplete ? "Minimum photo requirement complete" : "Two required photos needed"}</p>
            <p className="text-sm">{requiredPhotosComplete ? "Your headshot and full-body photo are stored. Select Save photos to confirm this step." : "Upload one professional headshot and one full-body photo."}</p>
          </div>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {PHOTO_TYPES.map((photoType) => (
            <div key={photoType.id} className={`space-y-3 rounded-2xl border p-5 transition-shadow hover:shadow-sm ${photos[photoType.id] ? "border-green-500/40 bg-green-500/5" : "bg-card"}`}>
              <div>
                <Label className="text-base">{photoType.label}{photoType.id === "headshot" || photoType.id === "full-body" ? " *" : " (optional)"}</Label>
                <p className="text-sm text-muted-foreground">{photoType.description}</p>
              </div>

              {photos[photoType.id] ? (
                <div className="group relative">
                  <img src={photos[photoType.id]} alt={photoType.label} className="h-64 w-full rounded-lg border object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-lg bg-black/60 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <Input type="file" accept="image/*" onChange={(e) => uploadPhoto(e, photoType.id)} disabled={uploading === photoType.id} className="hidden" id={`photo-${photoType.id}`} />
                    <label htmlFor={`photo-${photoType.id}`}><Button variant="secondary" size="sm" disabled={uploading === photoType.id} asChild><span className="cursor-pointer"><Upload className="mr-2 h-4 w-4" />Replace</span></Button></label>
                    <Button type="button" variant="destructive" size="sm" onClick={() => deletePhoto(photoType.id)}><X className="mr-2 h-4 w-4" />Remove</Button>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border-2 border-dashed p-8 text-center">
                  <Input type="file" accept="image/*" onChange={(e) => uploadPhoto(e, photoType.id)} disabled={uploading === photoType.id} className="hidden" id={`photo-${photoType.id}`} />
                  <label htmlFor={`photo-${photoType.id}`} className="cursor-pointer"><div className="flex flex-col items-center gap-2"><Upload className="h-8 w-8 text-muted-foreground" /><p className="text-sm font-medium">{uploading === photoType.id ? "Uploading..." : "Click to upload"}</p><p className="text-xs text-muted-foreground">JPG, PNG or WEBP (max 5MB)</p></div></label>
                </div>
              )}
            </div>
          ))}
        </div>
        <div className={`mt-6 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${photosConfirmed && requiredPhotosComplete ? "border-green-300 bg-green-50" : "bg-muted/30"}`}>
          <div className="flex items-center gap-3">
            {photosConfirmed && requiredPhotosComplete && <CheckCircle2 className="h-6 w-6 shrink-0 text-green-600" />}
            <div>
              <p className="font-semibold">{photosConfirmed && requiredPhotosComplete ? "Step 8 photos saved" : "Save your photo progress"}</p>
              <p className="text-sm text-muted-foreground">{requiredPhotosComplete ? "Both required photos are ready." : "You can save after uploading the two required photos."}</p>
            </div>
          </div>
          <Button type="button" size="lg" onClick={savePhotos} disabled={savingPhotos || Boolean(uploading) || !requiredPhotosComplete} className="shrink-0">
            <Save className="mr-2 h-5 w-5" />{savingPhotos ? "Saving photos…" : photosConfirmed ? "Photos saved" : "Save photos"}
          </Button>
        </div>
      </CardContent>
    </>
  );

  return embedded ? <div>{content}</div> : <Card className="overflow-hidden rounded-2xl shadow-sm">{content}</Card>;
}
