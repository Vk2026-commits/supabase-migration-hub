import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

const getProfileInitials = (name?: string | null, email?: string | null) => {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return email?.trim().charAt(0).toUpperCase() || "?";
};

interface ProfileAvatarProps {
  name?: string | null;
  email?: string | null;
  src?: string | null;
  className?: string;
  fallbackClassName?: string;
}

export function ProfileAvatar({
  name,
  email,
  src,
  className,
  fallbackClassName,
}: ProfileAvatarProps) {
  return (
    <Avatar className={cn("h-10 w-10 border border-border bg-background shadow-sm", className)}>
      {src ? (
        <AvatarImage
          src={src}
          alt={name ? `${name}'s profile picture` : "Profile picture"}
          className="object-cover"
        />
      ) : null}
      <AvatarFallback className={cn("bg-primary/10 font-semibold text-primary", fallbackClassName)}>
        {getProfileInitials(name, email)}
      </AvatarFallback>
    </Avatar>
  );
}
