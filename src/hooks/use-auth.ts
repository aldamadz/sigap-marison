import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { toUIUser } from '@/adapters/user.adapter';

export const useAuth = () => {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  
  // Gunakan ref untuk melacak ID proses agar tidak terjadi tabrakan fetch
  const lastFetchId = useRef<string | null>(null);

  const fetchFullProfile = async (sessionUser: any) => {
    if (!sessionUser) {
      setUser(null);
      setLoading(false);
      return;
    }

    // Buat ID unik untuk fetch kali ini
    const currentFetchId = Math.random().toString(36);
    lastFetchId.current = currentFetchId;

    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select(`
          *,
          master_offices!profiles_office_id_new_fkey (name)
        `)
        .eq('id', sessionUser.id)
        .single();

      if (error) throw error;

      // HANYA update state jika ini adalah fetch terakhir yang diminta
      // Ini mencegah data lama menimpa data baru (race condition)
      if (lastFetchId.current === currentFetchId) {
        const fullUser = {
          ...toUIUser(profile),
          email: sessionUser.email,
          officeName: profile.master_offices?.name
        };
        setUser(fullUser);
      }
    } catch (err: any) {
      // Abaikan jika error disebabkan oleh pembatalan request (Abort)
      if (err.name !== 'AbortError') {
        console.error("Error fetching profile:", err);
        if (lastFetchId.current === currentFetchId) {
          setUser(sessionUser); 
        }
      }
    } finally {
      if (lastFetchId.current === currentFetchId) {
        setLoading(false);
      }
    }
  };

  useEffect(() => {
    let mounted = true;

    // Ambil session awal secara sinkron dengan listener
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (mounted) {
        if (session?.user) {
          fetchFullProfile(session.user);
        } else {
          setLoading(false);
        }
      }
    };

    initAuth();

    // Listen perubahan auth (termasuk token refresh saat pindah tab)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          fetchFullProfile(session.user);
        }
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setLoading(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  return { user, loading };
};
