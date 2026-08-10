import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Upload, X } from "lucide-react";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";

interface PhotoUploadProps {
  userId: string;
  currentPhotoUrl?: string;
  onPhotoChange: (url: string) => void;
  size?: "sm" | "lg";
}

export function PhotoUpload({ userId, currentPhotoUrl, onPhotoChange, size = "sm" }: PhotoUploadProps) {
  const [uploading, setUploading] = useState(false);

  const uploadPhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);

      if (!event.target.files || event.target.files.length === 0) {
        return;
      }

      const file = event.target.files[0];
      const fileExt = file.name.split(".").pop();
      const fileName = `${userId}/${Math.random()}.${fileExt}`;
      const filePath = fileName;

      const { error: uploadError } = await supabase.storage
        .from("officer-avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        throw uploadError;
      }

      // Use signed URL for private bucket (24 hour expiry for avatars)
      const { data, error: signedError } = await supabase.storage
        .from("officer-avatars")
        .createSignedUrl(filePath, 86400);

      if (signedError || !data) {
        throw signedError || new Error("Failed to get signed URL");
      }

      onPhotoChange(data.signedUrl);
      toast.success("Photo uploaded successfully");
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setUploading(false);
    }
  };

  const removePhoto = async () => {
    if (!currentPhotoUrl) return;

    try {
      const filePath = currentPhotoUrl.split("/officer-avatars/")[1];
      if (filePath) {
        await supabase.storage.from("officer-avatars").remove([filePath]);
      }
      onPhotoChange("");
      toast.success("Photo removed");
    } catch (error: any) {
      toast.error("Failed to remove photo");
    }
  };

  const avatarSize = size === "lg" ? "h-32 w-32" : "h-24 w-24";

  return (
    <div className="flex items-center gap-4">
      <Avatar className={avatarSize}>
        <AvatarImage src={currentPhotoUrl} alt="Profile photo" />
        <AvatarFallback>
          <Upload className="h-8 w-8" />
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={uploading}
            onClick={() => document.getElementById(`photo-upload-${size}`)?.click()}
          >
            <Upload className="mr-2 h-4 w-4" />
            {uploading ? "Uploading..." : currentPhotoUrl ? "Change Photo" : "Upload Photo"}
          </Button>
          {currentPhotoUrl && (
            <Button variant="ghost" size="sm" onClick={removePhoto}>
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        <input
          id={`photo-upload-${size}`}
          type="file"
          accept="image/*"
          onChange={uploadPhoto}
          disabled={uploading}
          className="hidden"
        />
        <p className="text-xs text-muted-foreground">
          JPG, PNG or WEBP. Max 5MB.
        </p>
      </div>
    </div>
  );
}
