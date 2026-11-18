import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { notificationReturnPath } from '@/lib/notification-target';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

import { LoginSpotlight } from './LoginSpotlight';
import './login-spotlight.css';

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false); // State untuk Checkbox
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const resetTriggerRef = useRef<HTMLButtonElement>(null);
  const navigate = useNavigate();
  const location = useLocation();
  // Load email jika sebelumnya memilih 'Remember Me'
  useEffect(() => {
    const savedEmail = localStorage.getItem('remembered_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const destination = window.location.pathname === '/maintenance-admin' ? '/admin/configuration/maintenance' : notificationReturnPath(location.state?.from);
    setIsLoading(true);

    try {
      // 1. SET FLAG UNTUK CUSTOM STORAGE PROXY
      // Nilai ini akan dibaca oleh logic di lib/supabase.ts
      if (rememberMe) {
        localStorage.setItem('sb-remember', 'true');
        localStorage.setItem('remembered_email', email);
      } else {
        localStorage.removeItem('sb-remember');
        localStorage.removeItem('remembered_email');
      }

      // 2. PROSES OTENTIKASI
      const { data, error } = await supabase.auth.signInWithPassword({ 
        email, 
        password 
      });

      if (error) throw error;

      if (data.session) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('is_active')
          .eq('id', data.session.user.id)
          .maybeSingle();
        if (profile?.is_active === false) {
          await supabase.auth.signOut();
          throw new Error('Akun deaktif');
        }
        toast.success('Login Berhasil!');
        navigate(destination);
      }
    } catch (error: any) {
      const message = String(error.message || '');
      toast.error(/ban|banned|deaktif|inactive/i.test(message) ? 'Akun deaktif' : (message || 'Kredensial tidak valid'));
      
      // Bersihkan flag jika login gagal agar tidak terjadi persistensi salah
      localStorage.removeItem('sb-remember');
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenReset = () => {
    setResetEmail(email.trim());
    setResetOpen(true);
  };

  const handlePasswordResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmail = resetEmail.trim().toLowerCase();

    if (!targetEmail) {
      toast.error('Masukkan email kerja terlebih dahulu.');
      return;
    }

    setResetLoading(true);
    try {
      const response = await fetch('/api/auth/password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: targetEmail }),
      });

      if (!response.ok) {
        const message = response.status === 429
          ? 'Terlalu banyak permintaan reset. Silakan tunggu beberapa saat sebelum mencoba lagi.'
          : 'Permintaan reset kata sandi tidak dapat diproses. Silakan coba lagi.';
        toast.error(message);
        return;
      }

      toast.success('Link reset kata sandi sudah dikirim jika email terdaftar.');
      setResetOpen(false);
    } catch {
      toast.error('Permintaan reset kata sandi belum dapat dikirim. Periksa koneksi Anda lalu coba lagi.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <>
    <main className="sigap-login">
      <section className="sigap-login-sidebar" aria-labelledby="login-heading">
        <div className="sigap-login-form">
          <div className="mb-8 flex items-center gap-3">
            <img src="/marison-sigap-logo-v2.png" alt="" width={44} height={44} className="size-11 shrink-0 object-contain" />
            <span className="text-xl font-extrabold text-primary sm:text-2xl">Marison - SIGAP</span>
          </div>

          <div className="mb-8">
            <h1 id="login-heading" className="text-3xl font-extrabold leading-tight">Selamat Datang</h1>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">Masuk ke Sistem Persetujuan Digital Terintegrasi.</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5" aria-busy={isLoading}>
            <div className="space-y-2">
              <Label htmlFor="email">Email Kerja</Label>
              <div className="relative">
                <Mail aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nama@perusahaan.com"
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  className="h-12 rounded-lg bg-muted pl-11 text-base sm:text-sm"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <Label htmlFor="password">Kata Sandi</Label>
                <button
                  ref={resetTriggerRef}
                  type="button"
                  onClick={handleOpenReset}
                  className="rounded text-sm font-semibold text-primary hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  Lupa sandi?
                </button>
              </div>
              <div className="relative">
                <Lock aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Masukkan password Anda"
                  autoComplete="current-password"
                  className="h-12 rounded-lg bg-muted pl-11 pr-12 text-base sm:text-sm"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(value => !value)}
                  aria-label={showPassword ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'}
                  className="absolute inset-y-0 right-1 grid w-11 place-items-center rounded-md text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                >
                  {showPassword ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                </button>
              </div>
            </div>

            <div className="flex min-h-8 items-center gap-2.5">
              <Checkbox id="remember" checked={rememberMe} onCheckedChange={checked => setRememberMe(checked === true)} className="size-[18px] rounded-full border-primary" />
              <Label htmlFor="remember" className="cursor-pointer text-sm font-medium text-muted-foreground">
                Ingat saya di perangkat ini
              </Label>
            </div>

            <Button type="submit" disabled={isLoading} className="group h-[50px] w-full rounded-lg text-base font-bold shadow-[0_10px_26px_-7px_hsl(var(--primary)/0.6)]">
              {isLoading ? <><Loader2 aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> Memproses...</> : <>
                Masuk Sekarang <ArrowRight aria-hidden="true" className="motion-safe:transition-transform motion-safe:group-hover:translate-x-1" />
              </>}
            </Button>
          </form>
        </div>
      </section>
      <LoginSpotlight />
    </main>
    <Dialog open={resetOpen} onOpenChange={(open) => !resetLoading && setResetOpen(open)}>
      <DialogContent
        className="sigap-login-reset max-w-md rounded-lg border-border/70 p-0"
        onCloseAutoFocus={event => {
          event.preventDefault();
          resetTriggerRef.current?.focus();
        }}
        accessibilityTitle="Reset kata sandi"
        accessibilityDescription="Kirim tautan reset kata sandi ke email kerja pengguna."
      >
        <form onSubmit={handlePasswordResetRequest}>
          <DialogHeader className="border-b border-border/70 px-6 py-5 text-left">
            <DialogTitle>Reset kata sandi</DialogTitle>
            <DialogDescription>
              Masukkan email kerja. Jika akun terdaftar, SIGAP akan mengirim tautan untuk membuat kata sandi baru.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 px-6 py-5">
            <Label htmlFor="reset-email">Email kerja</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="reset-email"
                type="email"
                value={resetEmail}
                onChange={(event) => setResetEmail(event.target.value)}
                placeholder="nama@marison.id"
                className="h-11 rounded-lg bg-muted pl-10 text-base sm:text-sm"
                autoComplete="email"
                disabled={resetLoading}
                required
              />
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Demi keamanan, pesan berhasil tidak membedakan apakah email terdaftar atau tidak.
            </p>
          </div>
          <DialogFooter className="gap-2 border-t border-border/70 px-6 py-4 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setResetOpen(false)}
              disabled={resetLoading}
              className="rounded-lg"
            >
              Batal
            </Button>
            <Button type="submit" disabled={resetLoading} className="rounded-lg">
              {resetLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Mengirim...
                </>
              ) : (
                'Kirim Link Reset'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
