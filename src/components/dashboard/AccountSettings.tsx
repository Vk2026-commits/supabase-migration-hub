import { ChangeEvent, useCallback, useEffect, useRef, useState } from "react";
import { Camera, KeyRound, Loader2, ShieldCheck, Trash2, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProfileAvatar } from "./ProfileAvatar";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

type AccountProfile = {
  email: string | null;
  full_name: string | null;
  username: string | null;
  avatar_url: string | null;
  role: string | null;
};

interface AccountSettingsProps {
  userId: string;
  onProfileUpdated?: (profile: AccountProfile) => void;
}

const avatarObjectPath = (url?: string | null) => {
  if (!url) return null;
  const marker = "/profile-avatars/";
  const index = url.indexOf(marker);
  return index >= 0 ? decodeURIComponent(url.slice(index + marker.length).split("?")[0]) : null;
};

export function AccountSettings({ userId, onProfileUpdated }: AccountSettingsProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [sendingReset, setSendingReset] = useState(false);

  const loadProfile = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("profiles")
      .select("email,full_name,username,avatar_url,role")
      .eq("id", userId)
      .single();
    setLoading(false);
    if (error) {
      toast.error("We couldn't load your account settings");
      return;
    }
    const account = data as AccountProfile;
    setProfile(account);
    setFullName(account.full_name || "");
    setUsername(account.username || "");
  }, [userId]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const publishProfile = (next: AccountProfile) => {
    setProfile(next);
    onProfileUpdated?.(next);
  };

  const saveIdentity = async () => {
    const normalizedName = fullName.trim();
    const normalizedUsername = username.trim();
    if (!normalizedName) {
      toast.error("Enter your name");
      return;
    }
    if (normalizedUsername && !/^[A-Za-z0-9_]{3,20}$/.test(normalizedUsername)) {
      toast.error("Username must be 3–20 letters, numbers, or underscores");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: normalizedName,
        username: normalizedUsername || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);
    setSaving(false);
    if (error) {
      toast.error(error.code === "23505" ? "That username is already taken" : error.message);
      return;
    }
    const next = { ...profile!, full_name: normalizedName, username: normalizedUsername || null };
    publishProfile(next);
    toast.success("Account profile updated");
  };

  const updateAvatarRecords = async (avatarUrl: string | null) => {
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
      .eq("id", userId);
    if (error) throw error;
    if (profile?.role === "officer") {
      const { error: officerError } = await supabase
        .from("officer_profiles")
        .update({ avatar_url: avatarUrl })
        .eq("user_id", userId);
      if (officerError) throw officerError;
    }
  };

  const handleAvatarUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Choose a JPG, PNG, or WebP image");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Profile pictures must be 5 MB or smaller");
      return;
    }
    setUploading(true);
    try {
      const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const objectPath = `${userId}/avatar-${Date.now()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from("profile-avatars")
        .upload(objectPath, file, { cacheControl: "3600", upsert: false });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("profile-avatars").getPublicUrl(objectPath);
      await updateAvatarRecords(data.publicUrl);
      const previousPath = avatarObjectPath(profile?.avatar_url);
      if (previousPath) await supabase.storage.from("profile-avatars").remove([previousPath]);
      publishProfile({ ...profile!, avatar_url: data.publicUrl });
      toast.success("Profile picture updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Profile picture upload failed");
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    setUploading(true);
    try {
      await updateAvatarRecords(null);
      const previousPath = avatarObjectPath(profile?.avatar_url);
      if (previousPath) await supabase.storage.from("profile-avatars").remove([previousPath]);
      publishProfile({ ...profile!, avatar_url: null });
      toast.success("Profile picture removed");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove profile picture");
    } finally {
      setUploading(false);
    }
  };

  const sendPasswordReset = async () => {
    if (!profile?.email) return;
    setSendingReset(true);
    const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setSendingReset(false);
    if (error) toast.error(error.message);
    else toast.success(`Password reset instructions sent to ${profile.email}`);
  };

  if (loading)
    return (
      <div className="mx-auto w-full max-w-4xl space-y-6" aria-label="Loading account settings">
        <Card className="overflow-hidden rounded-2xl">
          <CardHeader className="border-b bg-muted/30">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-72 max-w-full" />
          </CardHeader>
          <CardContent className="space-y-6 p-6">
            <div className="flex items-center gap-5">
              <Skeleton className="h-24 w-24 rounded-full" />
              <div className="space-y-3">
                <Skeleton className="h-10 w-36" />
                <Skeleton className="h-4 w-56" />
              </div>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full sm:col-span-2" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  if (!profile) return null;

  return (
    <div className="mx-auto w-full max-w-4xl space-y-6">
      <Card className="overflow-hidden rounded-2xl">
        <CardHeader className="border-b bg-muted/30">
          <CardTitle className="flex items-center gap-2">
            <UserRound className="h-5 w-5 text-primary" /> Profile identity
          </CardTitle>
          <CardDescription>
            Your photo and name appear on your dashboard and anywhere your profile is shown.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6 p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <ProfileAvatar
              name={fullName}
              email={profile.email}
              src={profile.avatar_url}
              className="h-24 w-24 text-2xl"
            />
            <div className="flex flex-wrap gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                onChange={handleAvatarUpload}
              />
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="mr-2 h-4 w-4" />
                )}
                {profile.avatar_url ? "Change picture" : "Add picture"}
              </Button>
              {profile.avatar_url && (
                <Button type="button" variant="outline" onClick={removeAvatar} disabled={uploading}>
                  <Trash2 className="mr-2 h-4 w-4" />
                  Remove
                </Button>
              )}
              <p className="w-full text-xs text-muted-foreground">
                JPG, PNG, or WebP. Maximum 5 MB. Without a photo, your initials are shown.
              </p>
            </div>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="account-full-name">Full name</Label>
              <Input
                id="account-full-name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="account-username">Username</Label>
              <Input
                id="account-username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Choose a username"
                autoCapitalize="none"
              />
              <p className="text-xs text-muted-foreground">
                3–20 letters, numbers, or underscores.
              </p>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="account-email">Email address</Label>
              <Input id="account-email" value={profile.email || ""} disabled />
              <p className="text-xs text-muted-foreground">
                Your verified sign-in email is protected.
              </p>
            </div>
          </div>
          <Button type="button" onClick={saveIdentity} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save profile
          </Button>
        </CardContent>
      </Card>

      <Card className="rounded-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" /> Password and security
          </CardTitle>
          <CardDescription>
            We’ll send a secure password-reset link to your verified email.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium">Reset your password</p>
            <p className="text-sm text-muted-foreground">
              The link expires and can only be used by you.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            onClick={sendPasswordReset}
            disabled={sendingReset}
          >
            <KeyRound className="mr-2 h-4 w-4" />
            {sendingReset ? "Sending…" : "Send reset email"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
