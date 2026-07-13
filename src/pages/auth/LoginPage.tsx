import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ArrowRight, Sun, Moon, Cloud, Loader2 } from 'lucide-react';
import { useTheme } from 'next-themes';
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

type LoginSkyMode = 'light' | 'dark';

export default function LoginPage() {
  const { resolvedTheme, setTheme } = useTheme();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [skyMode, setSkyMode] = useState<LoginSkyMode>(() => (resolvedTheme === 'dark' ? 'dark' : 'light'));
  const [isThemeAnimating, setIsThemeAnimating] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false); // State untuk Checkbox
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetLoading, setResetLoading] = useState(false);
  const navigate = useNavigate();
  const isDark = skyMode === 'dark';
  const stars = [
    { top: '9%', left: '12%', size: 1.4, delay: '0.1s', duration: '3.8s' },
    { top: '15%', left: '74%', size: 1.8, delay: '0.8s', duration: '4.5s' },
    { top: '23%', left: '40%', size: 1.2, delay: '1.3s', duration: '3.2s' },
    { top: '31%', left: '88%', size: 1.7, delay: '0.4s', duration: '4.8s' },
    { top: '40%', left: '19%', size: 1.1, delay: '1.9s', duration: '3.6s' },
    { top: '48%', left: '61%', size: 1.9, delay: '0.7s', duration: '4.2s' },
    { top: '58%', left: '82%', size: 1.3, delay: '2.2s', duration: '3.9s' },
    { top: '67%', left: '30%', size: 1.6, delay: '1.1s', duration: '4.6s' },
    { top: '75%', left: '69%', size: 1.2, delay: '2.7s', duration: '3.4s' },
    { top: '83%', left: '46%', size: 1.8, delay: '1.6s', duration: '4.1s' },
    { top: '18%', left: '25%', size: 1.1, delay: '2.9s', duration: '3.3s' },
    { top: '72%', left: '9%', size: 1.5, delay: '0.2s', duration: '4.4s' },
  ];

  // Load email jika sebelumnya memilih 'Remember Me'
  useEffect(() => {
    const savedEmail = localStorage.getItem('remembered_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setRememberMe(true);
    }
  }, []);

  useEffect(() => {
    if (isThemeAnimating) return;
    setSkyMode(resolvedTheme === 'dark' ? 'dark' : 'light');
  }, [isThemeAnimating, resolvedTheme]);

  const handleThemeToggle = () => {
    const nextMode: LoginSkyMode = isDark ? 'light' : 'dark';
    setIsThemeAnimating(true);
    setSkyMode(nextMode);

    window.setTimeout(() => {
      setTheme(nextMode);
      window.setTimeout(() => setIsThemeAnimating(false), 260);
    }, 120);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
        navigate('/dashboard');
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
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error } = await supabase.auth.resetPasswordForEmail(targetEmail, {
        redirectTo,
      });

      if (error) throw error;

      toast.success('Link reset kata sandi sudah dikirim jika email terdaftar.');
      setResetOpen(false);
    } catch (error: any) {
      toast.error(error?.message || 'Gagal mengirim link reset kata sandi.');
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <>
    <div data-sky-mode={skyMode} className="login-shell flex min-h-screen w-full overflow-hidden bg-sky-50 text-slate-950 dark:bg-[#020617] dark:text-white">
      
      {/* SISI KIRI: FORM LOGIN */}
      <div className="relative z-20 flex min-h-screen w-full items-center justify-center bg-white/88 p-6 shadow-[18px_0_70px_-48px_rgba(15,23,42,0.45)] backdrop-blur-xl dark:bg-background/96 md:p-10 lg:w-[480px] lg:border-r lg:border-slate-200/70 dark:lg:border-border">
        <button
          type="button"
          onClick={handleThemeToggle}
          disabled={isThemeAnimating}
          className="absolute right-5 top-5 inline-flex h-10 items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary dark:border-border dark:bg-card/80 dark:text-muted-foreground dark:hover:bg-muted"
          aria-label={isDark ? 'Gunakan mode terang' : 'Gunakan mode gelap'}
          aria-busy={isThemeAnimating}
        >
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={isDark ? 'sun' : 'moon'}
              className="inline-flex"
              initial={{ opacity: 0, rotate: -45, scale: 0.72 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 45, scale: 0.72 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
            >
              {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </motion.span>
          </AnimatePresence>
          <span className="hidden sm:inline">{isDark ? 'Mode terang' : 'Mode gelap'}</span>
        </button>

        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-sm"
        >
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <img
                src="/marison-sigap-logo-v2.png"
                alt="Logo Marison"
                className="w-14 h-14 object-contain"
              />
              <h1 className="text-2xl font-black tracking-tight text-primary">Marison - SIGAP</h1>
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Selamat Datang</h2>
            <p className="text-muted-foreground text-sm mt-1">Masuk untuk memproses agenda, surat, dan persetujuan.</p>
            <p className="mt-3 inline-flex rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              Deploy test dari perangkat lokal
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email Kerja</Label>
              <div className="relative group">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <input 
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="aldamaaa.id@gmail.com"
                  className="flex h-11 w-full rounded-xl border border-input bg-white/80 pl-10 pr-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 transition-all dark:bg-muted/40"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Kata Sandi</Label>
                <button
                  type="button"
                  onClick={handleOpenReset}
                  className="text-xs text-primary hover:underline font-semibold"
                >
                  Lupa sandi?
                </button>
              </div>
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <input 
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="flex h-11 w-full rounded-xl border border-input bg-white/80 pl-10 pr-10 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 transition-all dark:bg-muted/40"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center space-x-2 py-1">
              <Checkbox 
                id="remember" 
                checked={rememberMe} 
                onCheckedChange={(checked) => setRememberMe(checked as boolean)}
              />
              <Label 
                htmlFor="remember" 
                className="text-xs font-medium text-muted-foreground cursor-pointer"
              >
                Ingat saya di perangkat ini
              </Label>
            </div>

            <Button disabled={isLoading} className="w-full h-12 rounded-xl text-base font-bold shadow-lg shadow-primary/20 group">
              {isLoading ? "Otentikasi..." : (
                <span className="flex items-center gap-2">
                  Masuk Sekarang <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </span>
              )}
            </Button>
          </form>
        </motion.div>
      </div>

      {/* SISI KANAN: SKY SCENE */}
      <div className="login-visual hidden flex-1 items-center justify-center overflow-hidden lg:flex">
        <div className="login-day-scene">
          <div className="login-sun">
            <Sun className="h-20 w-20 text-amber-500" />
          </div>
          <div className="login-cloud login-cloud-one">
            <Cloud className="h-24 w-24" />
          </div>
          <div className="login-cloud login-cloud-two">
            <Cloud className="h-16 w-16" />
          </div>
          <div className="login-horizon" />
        </div>

        <div className="login-night-scene">
          {stars.map((star, i) => (
            <div 
              key={i} 
              className="star absolute rounded-full bg-white opacity-35" 
              style={{
                width: `${star.size}px`,
                height: `${star.size}px`,
                top: star.top,
                left: star.left,
                animation: `twinkle ${star.duration} infinite ease-in-out`,
                animationDelay: star.delay,
              }}
            />
          ))}

          <div className="shooting-star" style={{ top: '10%', right: '10%' }} />
          <div className="shooting-star delay-v-slow" style={{ top: '30%', right: '5%' }} />
          <div className="shooting-star delay-slow" style={{ top: '0%', right: '40%' }} />
        </div>

        <div className="relative z-10 text-center px-10">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="login-hero-title mb-4 text-6xl font-black tracking-tighter"
          >
            MARISON - SIGAP
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.72 }}
            transition={{ delay: 0.5 }}
            className="login-hero-subtitle text-lg font-medium uppercase tracking-[0.34em]"
          >
            Sistem Persetujuan Digital Terintegrasi
          </motion.p>
        </div>

      </div>

    </div>
    <Dialog open={resetOpen} onOpenChange={(open) => !resetLoading && setResetOpen(open)}>
      <DialogContent
        className="max-w-md rounded-2xl border-border/70 p-0"
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
                className="h-11 rounded-xl bg-background pl-10"
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
              className="rounded-xl"
            >
              Batal
            </Button>
            <Button type="submit" disabled={resetLoading} className="rounded-xl">
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
