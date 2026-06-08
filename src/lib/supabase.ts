import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY

// Helper untuk menentukan storage mana yang digunakan
const customStorage = {
  getItem: (key: string) => {
    const localValue = localStorage.getItem(key);
    if (localValue) return localValue;

    // Migrasi session lama: sebelumnya token bisa tersimpan di sessionStorage,
    // sehingga tab baru tidak punya session. Salin ke localStorage saat masih ada.
    const sessionValue = sessionStorage.getItem(key);
    if (sessionValue) localStorage.setItem(key, sessionValue);
    return sessionValue;
  },
  setItem: (key: string, value: string) => {
    // Auth session harus lintas tab. Preferensi "remember me" hanya untuk email,
    // bukan untuk token Supabase, karena sessionStorage memaksa tab baru login ulang.
    localStorage.setItem(key, value);
    sessionStorage.removeItem(key);
  },
  removeItem: (key: string) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    storage: customStorage, // Menggunakan proxy storage buatan kita
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: { eventsPerSecond: 10 },
    heartbeatIntervalMs: 15000,
  }
})
