import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";

interface OfficerPhotosProps {
  userId: string;
  embedded?: boolean;
  onChanged?: (photos: Record<string, string>) => void;
}

const PHOTO_TYPES = [
  { id: "headshot", label: "Professional Headshot", description: "Close-up portrait photo" },
  { id: "full-body", label: "Full Body Shot", description: "Full body in uniform" },
  { id: "action-1", label: "Action Shot 1", description: "On duty or training" },
  { id: "action-2", label: "Action Shot 2", description: "On duty or training" },
];

export function OfficerPhotos({ userId, embedded = false, onChanged }: OfficerPhotosProps) {
  const [photos, setPhotos] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    loadPhotos();
  }, [userId]);

  const loadPhotos = async () => {
    try {
      const { data, error } = await supabase.storage
        .from("officer-photos")
        .list(userId, {
          limit: 100,
          offset: 0,
        });

      if (error) throw error;

      const photoUrls: Record<string, string> = {};
      
      // Use signed URLs for private bucket access
      for (const file of data || []) {
        const photoType = file.name.split(".")[0];
        const { data: signedData, error: signedError } = await supabase.storage
          .from("officer-photos")
          .createSignedUrl(`${userId}/${file.name}`, 3600); // 1 hour expiry
        
        if (!signedError && signedData) {
          photoUrls[photoType] = signedData.signedUrl;
        }
      }

      setPhotos(photoUrls);
      onChanged?.(photoUrls);
    } catch (error: any) {
      console.error("Error loading photos:", error);
    }
  };

  const uploadPhoto = async (event: React.ChangeEvent<HTMLInputElement>, photoType: string) => {
    try {
      setUploading(photoType);

      if (!event.target.files || event.target.files.length === 0) {
        return;
      }

      const file = event.target.files[0];
      
      // Validate file size (5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error("File size must be less than 5MB");
        return;
      }

      const fileExt = file.name.split(".").pop();
      const filePath = `${userId}/${photoType}.${fileExt}`;

      // Delete old photo if exists
      if (photos[photoType]) {
        const oldPath = `${userId}/${photoType}.${fileExt}`;
        await supabase.storage.from("officer-photos").remove([oldPath]);
      }

      const { error: uploadError } = await supabase.storage
        .from("officer-photos")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      toast.success("Photo uploaded successfully!");
      loadPhotos();
    } catch (error: any) {
      toast.error("Error uploading photo: " + error.message);
    } finally {
      setUploading(null);
    }
  };

  const deletePhoto = async (photoType: string) => {
    try {
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
        loadPhotos();
      }
    } catch (error: any) {
      toast.error("Error deleting photo: " + error.message);
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
      </CardContent>
    </>
  );

  return embedded ? <div>{content}</div> : <Card className="overflow-hidden rounded-2xl shadow-sm">{content}</Card>;
}
