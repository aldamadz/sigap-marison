import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { supabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, src, ...props }, ref) => {
  const requiresAuthorization = Boolean(src?.startsWith("/api/profile/avatar/file"));
  const [resolvedSrc, setResolvedSrc] = React.useState<string | undefined>(
    requiresAuthorization ? undefined : src,
  );

  React.useEffect(() => {
    if (!src || !src.startsWith("/api/profile/avatar/file")) {
      setResolvedSrc(src);
      return undefined;
    }

    let cancelled = false;
    let objectUrl = "";

    const loadPrivateAvatar = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      const response = await fetch(src, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!response.ok || cancelled) return;

      objectUrl = URL.createObjectURL(await response.blob());
      if (!cancelled) setResolvedSrc(objectUrl);
    };

    setResolvedSrc(undefined);
    void loadPrivateAvatar();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [src]);

  return (
    <AvatarPrimitive.Image
      ref={ref}
      src={resolvedSrc}
      className={cn("aspect-square h-full w-full", className)}
      {...props}
    />
  );
});
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn("flex h-full w-full items-center justify-center rounded-full bg-muted", className)}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };
