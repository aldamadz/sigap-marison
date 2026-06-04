import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ShieldCheck, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { toast } from 'sonner';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false); // State untuk Checkbox
  const navigate = useNavigate();

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

  return (
    <div className="min-h-screen w-full flex bg-[#020617] overflow-hidden">
      
      {/* SISI KIRI: FORM LOGIN */}
      <div className="w-full lg:w-[480px] relative z-20 flex items-center justify-center p-8 md:p-12 bg-background border-r border-border">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6 }}
          className="w-full max-w-sm"
        >
          <div className="mb-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-primary flex items-center justify-center text-primary-foreground shadow-lg shadow-primary/20">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <h1 className="text-3xl font-black tracking-tighter text-primary uppercase">SIGAP</h1>
            </div>
            <h2 className="text-2xl font-bold tracking-tight">Selamat Datang</h2>
            <p className="text-muted-foreground text-sm mt-1">Silakan masuk untuk mengelola agenda Anda.</p>
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
                  className="flex h-11 w-full rounded-xl border border-input bg-muted/40 pl-10 pr-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Kata Sandi</Label>
                <button type="button" className="text-xs text-primary hover:underline font-semibold">Lupa sandi?</button>
              </div>
              <div className="relative group">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground group-focus-within:text-primary transition-colors" />
                <input 
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="flex h-11 w-full rounded-xl border border-input bg-muted/40 pl-10 pr-10 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 transition-all"
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

      {/* SISI KANAN: ANIMASI BINTANG JATUH */}
      <div className="hidden lg:flex flex-1 relative items-center justify-center overflow-hidden">
        <div className="absolute inset-0 z-0">
          {[...Array(60)].map((_, i) => (
            <div 
              key={i} 
              className="star absolute bg-white rounded-full opacity-30" 
              style={{
                width: Math.random() * 2 + 'px',
                height: Math.random() * 2 + 'px',
                top: Math.random() * 100 + '%',
                left: Math.random() * 100 + '%',
                animation: `twinkle ${Math.random() * 3 + 2}s infinite ease-in-out`
              }}
            />
          ))}
        </div>

        <div className="shooting-star" style={{ top: '10%', right: '10%' }} />
        <div className="shooting-star delay-v-slow" style={{ top: '30%', right: '5%' }} />
        <div className="shooting-star delay-slow" style={{ top: '0%', right: '40%' }} />

        <div className="relative z-10 text-center px-10">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-6xl font-black text-white tracking-tighter mb-4"
          >
            SIGAP
          </motion.h2>
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            transition={{ delay: 0.5 }}
            className="text-lg text-white uppercase tracking-[0.4em] font-light"
          >
            Sistem Informasi Agenda & Persuratan
          </motion.p>
        </div>

        <div className="absolute top-[-20%] right-[-10%] w-[600px] h-[600px] bg-primary/20 rounded-full blur-[150px]" />
      </div>

    </div>
  );
}
