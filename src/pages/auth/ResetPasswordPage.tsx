import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Eye, EyeOff, KeyRound, Loader2, Lock, ShieldCheck } from "lucide-react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

const normalizeResetError = (message?: string) => {
  const text = (message || "").trim();
  const lower = text.toLowerCase();

  if (lower.includes("new password should be different")) {
    return "Kata sandi baru harus berbeda dari kata sandi yang sedang digunakan.";
  }
  if (lower.includes("password should be at least") || lower.includes("weak password")) {
    return "Kata sandi belum memenuhi syarat keamanan. Gunakan minimal 8 karakter dengan kombinasi yang lebih kuat.";
  }
  if (lower.includes("invalid") || lower.includes("expired")) {
    return "Link reset tidak valid atau sudah kedaluwarsa. Minta link baru dari halaman login.";
  }

  return text || "Gagal memperbarui kata sandi.";
};

const getHashError = () => {
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return "";
  const params = new URLSearchParams(hash);
  return params.get("error_description") || params.get("error") || "";
};

const getRecoveryTokenHash = () => {
  const params = new URLSearchParams(window.location.search);
  const type = params.get("type");
  const tokenHash = params.get("token_hash");
  if (type !== "recovery" || !tokenHash) return null;
  return tokenHash;
};

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [ready, setReady] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState("");

  const strength = useMemo(() => {
    let score = 0;
    if (password.length >= 8) score += 1;
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1;
    if (/\d/.test(password)) score += 1;
    if (/[^A-Za-z0-9]/.test(password)) score += 1;
    return score;
  }, [password]);

  useEffect(() => {
    let active = true;

    const hydrateRecoverySession = async () => {
      const hashError = getHashError();
      if (hashError) {
        if (active) {
          setErrorMessage(hashError);
          setReady(false);
          setChecking(false);
        }
        return;
      }

      const tokenHash = getRecoveryTokenHash();
      if (tokenHash) {
        const { data, error } = await supabase.auth.verifyOtp({
          type: "recovery",
          token_hash: tokenHash,
        });
        if (!active) return;

        if (error || !data.session) {
          setErrorMessage(error?.message || "Link reset tidak valid atau sudah kedaluwarsa. Minta link baru dari halaman login.");
          setReady(false);
        } else {
          window.history.replaceState({}, document.title, "/reset-password");
          setReady(true);
        }
        setChecking(false);
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (!active) return;

      if (error) {
        setErrorMessage(error.message);
        setReady(false);
      } else if (data.session) {
        setReady(true);
      } else {
        setErrorMessage("Link reset tidak valid atau sudah kedaluwarsa. Minta link baru dari halaman login.");
        setReady(false);
      }
      setChecking(false);
    };

    hydrateRecoverySession();

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setReady(true);
        setErrorMessage("");
        setChecking(false);
      }
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (saving || submitted) return;
    setFormError("");

    if (password.length < 8) {
      setFormError("Kata sandi minimal 8 karakter.");
      toast.error("Kata sandi minimal 8 karakter.");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Konfirmasi kata sandi belum sama.");
      toast.error("Konfirmasi kata sandi belum sama.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;

      setSubmitted(true);
      try {
        await supabase.rpc("record_auth_audit_event", { p_event: "password_changed" });
      } catch {
        // Audit failure must not block a completed password update.
      }
      await supabase.auth.signOut();
      toast.success("Kata sandi berhasil diperbarui. Silakan masuk kembali.");
      navigate("/", { replace: true });
    } catch (error: any) {
      const friendlyMessage = normalizeResetError(error?.message);
      setFormError(friendlyMessage);
      toast.error(friendlyMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top_left,rgba(22,163,74,0.12),transparent_34%),linear-gradient(135deg,#f8fafc,#ecfdf5)] p-5 text-slate-950 dark:bg-[radial-gradient(circle_at_top_left,rgba(34,197,94,0.16),transparent_34%),linear-gradient(135deg,#020617,#052e2b)] dark:text-white">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.32 }}
        className="w-full max-w-md overflow-hidden rounded-3xl border border-white/70 bg-white/92 shadow-[0_24px_80px_-44px_rgba(15,23,42,0.75)] backdrop-blur-xl dark:border-white/10 dark:bg-slate-950/88"
      >
        <div className="border-b border-slate-200/80 px-7 py-6 dark:border-white/10">
          <div className="mb-5 flex items-center gap-3">
            <img src="/marison-sigap-logo-v2.png" alt="Logo Marison" className="h-12 w-12 object-contain" />
            <div>
              <p className="text-sm font-black text-primary">Marison - SIGAP</p>
              <p className="text-xs text-muted-foreground">Reset kata sandi akun</p>
            </div>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl font-black tracking-tight">Buat kata sandi baru</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Gunakan kata sandi yang hanya dipakai untuk SIGAP dan simpan di tempat yang aman.
          </p>
        </div>

        {checking ? (
          <div className="flex items-center gap-3 px-7 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            Memeriksa link reset...
          </div>
        ) : !ready ? (
          <div className="space-y-5 px-7 py-7">
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/70 dark:bg-red-950/30 dark:text-red-200">
              {errorMessage || "Link reset tidak dapat digunakan."}
            </div>
            <Button className="h-11 w-full rounded-xl" onClick={() => navigate("/", { replace: true })}>
              Kembali ke Login
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5 px-7 py-7">
            <div className="space-y-2">
              <Label htmlFor="new-password">Kata sandi baru</Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="new-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  className="h-11 rounded-xl pl-10 pr-10"
                  autoComplete="new-password"
                  minLength={8}
                  disabled={saving || submitted}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((current) => !current)}
                  disabled={saving || submitted}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "Sembunyikan kata sandi" : "Tampilkan kata sandi"}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <div className="grid grid-cols-4 gap-1.5">
                {[0, 1, 2, 3].map((index) => (
                  <div
                    key={index}
                    className={`h-1.5 rounded-full ${index < strength ? "bg-primary" : "bg-muted"}`}
                  />
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Minimal 8 karakter. Lebih baik gunakan kombinasi huruf besar, huruf kecil, angka, dan simbol.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirm-password">Konfirmasi kata sandi</Label>
              <Input
                id="confirm-password"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="h-11 rounded-xl"
                autoComplete="new-password"
                minLength={8}
                disabled={saving || submitted}
                required
              />
            </div>

            <div className="flex items-start gap-3 rounded-2xl border border-primary/15 bg-primary/5 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              Kata sandi baru harus berbeda dari kata sandi yang sedang digunakan. Setelah berhasil, sesi reset akan ditutup dan Anda perlu masuk ulang.
            </div>

            {formError ? (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100">
                {formError}
              </div>
            ) : null}

            <Button type="submit" disabled={saving || submitted} className="h-12 w-full rounded-xl text-sm font-bold">
              {saving || submitted ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Menyimpan...
                </>
              ) : (
                <>
                  Simpan Kata Sandi Baru
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        )}
      </motion.div>
    </div>
  );
}
