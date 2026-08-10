import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Camera, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";

interface ProfilePhotoUploadProps {
  userId: string;
  currentAvatarUrl?: string;
  onPhotoUpdated: (url: string) => void;
}

export function ProfilePhotoUpload({ userId, currentAvatarUrl, onPhotoUpdated }: ProfilePhotoUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(currentAvatarUrl);

  const uploadAvatar = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);

      if (!event.target.files || event.target.files.length === 0) {
        return;
      }

      const file = event.target.files[0];
      const fileExt = file.name.split(".").pop();
      const filePath = `${userId}/avatar.${fileExt}`;

      // Delete old avatar if exists
      if (currentAvatarUrl) {
        const oldPath = currentAvatarUrl.split("/").slice(-2).join("/");
        await supabase.storage.from("officer-avatars").remove([oldPath]);
      }

      const { error: uploadError } = await supabase.storage
        .from("officer-avatars")
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Use signed URL for private bucket (24 hour expiry for avatars)
      const { data, error: signedError } = await supabase.storage
        .from("officer-avatars")
        .createSignedUrl(filePath, 86400);
      
      if (signedError || !data) {
        throw signedError || new Error("Failed to get signed URL");
      }
      
      setAvatarUrl(data.signedUrl);
      onPhotoUpdated(data.signedUrl);

      toast.success("Profile photo updated successfully!");
    } catch (error: any) {
      toast.error("Error uploading photo: " + error.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-4">
      <Avatar className="h-32 w-32">
        <AvatarImage src={avatarUrl} />
        <AvatarFallback>
          <Camera className="h-12 w-12 text-muted-foreground" />
        </AvatarFallback>
      </Avatar>
      
      <div className="flex flex-col items-center gap-2">
        <Input
          type="file"
          accept="image/*"
          onChange={uploadAvatar}
          disabled={uploading}
          className="hidden"
          id="avatar-upload"
        />
        <label htmlFor="avatar-upload">
          <Button variant="outline" disabled={uploading} asChild>
            <span className="cursor-pointer">
              <Upload className="mr-2 h-4 w-4" />
              {uploading ? "Uploading..." : "Upload Photo"}
            </span>
          </Button>
        </label>
        <p className="text-xs text-muted-foreground">JPG, PNG or WEBP (max 5MB)</p>
      </div>
    </div>
  );
}
