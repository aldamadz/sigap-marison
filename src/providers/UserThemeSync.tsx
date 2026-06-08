import { useEffect } from "react";
import { useTheme } from "next-themes";
import { supabase } from "@/lib/supabase";

export function UserThemeSync() {
  const { setTheme } = useTheme();

  useEffect(() => {
    let active = true;

    const syncTheme = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;

      const { data } = await supabase
        .from("profiles")
        .select("theme_preference")
        .eq("id", user.id)
        .maybeSingle();

      if (active && data?.theme_preference) {
        setTheme(data.theme_preference);
      }
    };

    syncTheme();
    return () => {
      active = false;
    };
  }, [setTheme]);

  return null;
}
