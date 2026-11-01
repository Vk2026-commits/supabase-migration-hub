import { listOfficerPhotos } from "@/lib/officerPhotos";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { CheckCircle2, Info, Save, Upload, X } from "lucide-react";

interface OfficerPhotosProps {
  userId: string;
  embedded?: boolean;
  optional?: boolean;
  onChanged?: (photos: Record<string, string>) => void;
  onSaved?: (complete: boolean) => void;
}

const PHOTO_TYPES = [
  { id: "headshot", label: "Professional Headshot", description: "Close-up portrait photo" },
  { id: "full-body", label: "Full Body Shot", description: "Full body in uniform" },
  { id: "action-1", label: "Action Shot 1", description: "On duty or training" },
  { id: "action-2", label: "Action Shot 2", description: "On duty or training" },
];

const preparePhotoForUpload = async (file: File): Promise<File> => {
  if (!file.type.startsWith("image/") || file.size <= 2 * 1024 * 1024 || /gif|svg/i.test(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxDimension = 1920;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "photo"}.jpg`, { type: "image/jpeg", lastModified: file.lastModified });
  } catch (error) {
    console.warn("Photo compression was unavailable; uploading the original file", error);
    return file;
  }
};

export function OfficerPhotos({ userId, embedded = false, optional = false, onChanged, onSaved }: OfficerPhotosProps) {
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [loadingPhotos, setLoadingPhotos] = useState(true);
  const [photoLoadError, setPhotoLoadError] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [updatingAvatar, setUpdatingAvatar] = useState(false);
  const [savingPhotos, setSavingPhotos] = useState(false);
  const [photosConfirmed, setPhotosConfirmed] = useState(false);
  const [hasSubmittedApplication, setHasSubmittedApplication] = useState(false);
  const [showResubmitReminder, setShowResubmitReminder] = useState(false);

  const requiredPhotosComplete = Boolean(photos.headshot && photos["full-body"]);

  useEffect(() => {
    void loadPhotos(true);
    void (async () => {
      const { data } = await (supabase as any)
        .from("guard_hiring_applications")
        .select("id")
        .eq("user_id", userId)
        .eq("application_type", "master")
        .eq("status", "submitted")
        .limit(1)
        .maybeSingle();
      setHasSubmittedApplication(Boolean(data));
    })();
  }, [userId]);

  const loadPhotos = async (confirmExisting = false) => {
    setLoadingPhotos(true);
    setPhotoLoadError(false);
    try {
      const { data, error } = await listOfficerPhotos(userId);

      if (error) throw error;

      const files = (data || []).filter(file => PHOTO_TYPES.some(type => type.id === file.name.split(".")[0]));
      if (confirmExisting) {
        const storedTypes = files.map((file) => file.name.split(".")[0]);
        const complete = storedTypes.includes("headshot") && storedTypes.includes("full-body");
        setPhotosConfirmed(complete);
        onSaved?.(complete);
      }

      const photoUrls: Record<string, string> = {};
      if (files.length) {
        // One signing request for the whole gallery instead of four competing requests.
        const { data: signed, error: signError } = await supabase.storage.from("officer-photos")
          .createSignedUrls(files.map(file => `${userId}/${file.name}`), 3600);
        if (signError) throw signError;
        for (const photo of signed || []) {
          if (photo.error || !photo.signedUrl || !photo.path) throw new Error("Photo preview unavailable");
          const type = photo.path.split("/").pop()!.split(".")[0];
          if (!photoUrls[type]) photoUrls[type] = photo.signedUrl;
        }
      }

      setPhotos(photoUrls);
      onChanged?.(photoUrls);
      return photoUrls;
    } catch (error: any) {
      console.error("Error loading photos:", error);
      setPhotoLoadError(true);
      return null;
    } finally {
      setLoadingPhotos(false);
    }
  };

  const updateProfilePicture = async (file: Blob) => {
    // Use a durable avatar URL, never persist an expiring private signed URL.
    const extension = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
    const path = `${userId}/headshot-${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from("profile-avatars")
      .upload(path, file, { contentType: file.type, cacheControl: "3600" });
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from("profile-avatars").getPublicUrl(path);
    const { error: profileError } = await supabase.from("profiles")
      .update({ avatar_url: data.publicUrl, updated_at: new Date().toISOString() }).eq("id", userId);
    if (profileError) throw profileError;
    const { error: officerError } = await supabase.from("officer_profiles")
      .update({ avatar_url: data.publicUrl }).eq("user_id", userId);
    if (officerError) throw officerError;
    window.dispatchEvent(new CustomEvent("officer-avatar-updated", { detail: { userId, avatarUrl: data.publicUrl } }));
  };

  const useExistingHeadshot = async () => {
    setUpdatingAvatar(true);
    try {
      const response = await fetch(photos.headshot);
      if (!response.ok) throw new Error("Could not read the saved headshot");
      await updateProfilePicture(await response.blob());
      toast.success("Headshot is now your profile picture");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update profile picture. Try again.");
    } finally {
      setUpdatingAvatar(false);
    }
  };

  const uploadPhoto = async (event: React.ChangeEvent<HTMLInputElement>, photoType: string) => {
    try {
      setUploading(photoType);

      if (!event.target.files || event.target.files.length === 0) {
        return;
      }

      const originalFile = event.target.files[0];
      setPhotosConfirmed(false);
      onSaved?.(false);
      
      // Current phone cameras commonly produce images larger than 5 MB.
      if (originalFile.size > 20 * 1024 * 1024) {
        toast.error("Photo must be 20MB or smaller");
        return;
      }

      const file = await preparePhotoForUpload(originalFile);

      const fileExt = file.name.split(".").pop();
      const filePath = `${userId}/${photoType}.${fileExt}`;

      // Delete old photo if exists
      if (photos[photoType]) {
        const { data: existingFiles } = await listOfficerPhotos(userId);
        const oldPaths = (existingFiles || []).filter((item) => item.name.startsWith(`${photoType}.`)).map((item) => `${userId}/${item.name}`);
        if (oldPaths.length) await supabase.storage.from("officer-photos").remove(oldPaths);
      }

      const { error: uploadError } = await supabase.storage
        .from("officer-photos")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      if (photoType === "headshot") {
        try {
          await updateProfilePicture(file);
          toast.success("Headshot uploaded and profile picture updated");
        } catch (error) {
          console.error("Headshot saved but profile picture update failed:", error);
          toast.error("Headshot saved, but profile picture could not update. Use ‘Use as profile picture’ to retry.");
        }
      } else {
        toast.success("Photo uploaded successfully!");
      }
      if (hasSubmittedApplication) setShowResubmitReminder(true);
      const savedPhotos = await loadPhotos();
      const complete = Boolean(savedPhotos?.headshot && savedPhotos?.["full-body"]);
      setPhotosConfirmed(complete);
      onSaved?.(complete);
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
      const { data: files } = await listOfficerPhotos(userId);

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
      if (!savedPhotos) return;
      if (!optional && (!savedPhotos?.headshot || !savedPhotos["full-body"])) {
        setPhotosConfirmed(false);
        toast.error("Upload both a professional headshot and a full-body photo to complete this step");
        return;
      }
      const complete = Boolean(savedPhotos?.headshot && savedPhotos?.["full-body"]);
      setPhotosConfirmed(complete);
      onSaved?.(complete);
      toast.success("Photo progress saved");
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
        {embedded && <p className="mb-5 text-sm text-muted-foreground">{optional ? "Photos are recommended but do not block application submission. You can add them now or later from your profile." : "Your headshot and full-body photo are required. Action photos are optional."}</p>}
        {showResubmitReminder && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-950">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
            <div>
              <p className="font-semibold">Your profile photo was updated</p>
              <p className="mt-1 text-sm">Your previously submitted company copy remains unchanged. Open Hiring Application, select Edit Application, and then Resubmit to share this photo with the company.</p>
            </div>
          </div>
        )}
        <div className={`mb-6 flex items-start gap-3 rounded-xl border p-4 ${requiredPhotosComplete ? "border-green-200 bg-green-50 text-green-900" : "border-amber-200 bg-amber-50 text-amber-950"}`}>
          <CheckCircle2 className={`mt-0.5 h-5 w-5 shrink-0 ${requiredPhotosComplete ? "text-green-600" : "text-amber-500"}`} />
          <div>
            <p className="font-semibold">{requiredPhotosComplete ? "Recommended photos complete" : optional ? "Photos are optional" : "Two required photos needed"}</p>
            <p className="text-sm">{requiredPhotosComplete ? "Your headshot and full-body photo are stored." : optional ? "Adding a professional headshot and full-body photo can help employers review your application." : "Upload one professional headshot and one full-body photo."}</p>
          </div>
        </div>
        <div className="mb-4 flex items-center justify-between gap-3">
          <p role="status" className="text-sm">{loadingPhotos ? "Checking saved photos…" : photoLoadError ? "Could not load saved photos. Retry before uploading replacements." : `${Object.keys(photos).length} of 4 photos uploaded`}</p>
          <Button type="button" variant="outline" onClick={() => void loadPhotos(true)} disabled={loadingPhotos || Boolean(uploading)}>Refresh photos</Button>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {PHOTO_TYPES.map((photoType) => (
            <div key={photoType.id} className={`space-y-3 rounded-2xl border p-5 transition-shadow hover:shadow-sm ${photos[photoType.id] ? "border-green-500/40 bg-green-500/5" : "bg-card"}`}>
              <div>
                <Label className="text-base">{photoType.label}{optional ? " (optional)" : photoType.id === "headshot" || photoType.id === "full-body" ? " *" : " (optional)"}</Label>
                <p className="text-sm text-muted-foreground">{photoType.description}</p>
                {photoType.id === "headshot" && <p className="text-xs text-muted-foreground">Uploading a headshot also updates your officer profile picture.</p>}
              </div>

              {photoType.id === "headshot" && photos.headshot && <Button type="button" variant="outline" size="sm" disabled={updatingAvatar || Boolean(uploading)} onClick={useExistingHeadshot}>{updatingAvatar ? "Updating profile picture…" : "Use as profile picture"}</Button>}
              {photos[photoType.id] && <p className="text-sm font-medium text-green-700">✓ Uploaded and saved</p>}
              {photos[photoType.id] ? (
                <div className="group relative">
                  <img src={photos[photoType.id]} alt={photoType.label} className="h-64 w-full rounded-lg border object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-lg bg-black/60 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                    <Input type="file" accept="image/*" onChange={(e) => uploadPhoto(e, photoType.id)} disabled={uploading === photoType.id} className="hidden" id={`photo-${photoType.id}`} />
                    <label htmlFor={`photo-${photoType.id}`}><Button variant="secondary" size="sm" disabled={uploading === photoType.id} asChild><span className="cursor-pointer"><Upload className="mr-2 h-4 w-4" />Replace</span></Button></label>
                    <Button type="button" variant="destructive" size="sm" onClick={() => deletePhoto(photoType.id)}><X className="mr-2 h-4 w-4" />Remove</Button>
                  </div>
                </div>
              ) : loadingPhotos || photoLoadError ? (
                <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">{loadingPhotos ? "Loading photo…" : "Photo status unavailable — use Refresh photos"}</div>
              ) : (
                <div className="rounded-lg border-2 border-dashed p-8 text-center">
                  <Input type="file" accept="image/*" onChange={(e) => uploadPhoto(e, photoType.id)} disabled={uploading === photoType.id} className="hidden" id={`photo-${photoType.id}`} />
                  <label htmlFor={`photo-${photoType.id}`} className="cursor-pointer"><div className="flex flex-col items-center gap-2"><Upload className="h-8 w-8 text-muted-foreground" /><p className="text-sm font-medium">{uploading === photoType.id ? "Uploading..." : "Take or choose a photo"}</p><p className="text-xs text-muted-foreground">Phone photos and images up to 20MB</p></div></label>
                </div>
              )}
            </div>
          ))}
        </div>
        {!embedded && <div className={`mt-6 flex flex-col gap-3 rounded-2xl border p-4 sm:flex-row sm:items-center sm:justify-between ${photosConfirmed && requiredPhotosComplete ? "border-green-300 bg-green-50" : "bg-muted/30"}`}>
          <div className="flex items-center gap-3">
            {photosConfirmed && requiredPhotosComplete && <CheckCircle2 className="h-6 w-6 shrink-0 text-green-600" />}
            <div>
              <p className="font-semibold">{photosConfirmed && requiredPhotosComplete ? "Step 8 photos saved" : "Save your photo progress"}</p>
              <p className="text-sm text-muted-foreground">{requiredPhotosComplete ? "Both recommended photos are ready." : optional ? "Uploading photos is recommended, not required." : "You can save after uploading the two required photos."}</p>
            </div>
          </div>
          <Button type="button" size="lg" onClick={savePhotos} disabled={savingPhotos || Boolean(uploading) || (!optional && !requiredPhotosComplete)} className="shrink-0">
            <Save className="mr-2 h-5 w-5" />{savingPhotos ? "Saving photos…" : photosConfirmed ? "Photos saved" : "Save photos"}
          </Button>
        </div>}
        {embedded && <p className="mt-5 text-sm text-muted-foreground">Photos save as soon as they upload. Use Continue when you are ready to move on.</p>}
      </CardContent>
    </>
  );

  return embedded ? <div>{content}</div> : <Card className="overflow-hidden rounded-2xl shadow-sm">{content}</Card>;
}
