import { useEffect, useState } from "react";
import { Link } from "react-router";
import { CheckCircle2, Monitor, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { desktopWebApi } from "@/lib/desktop-api";
import { supabase } from "@/lib/supabase";

type Pairing = { id: string; device_name: string; platform: string; expires_at: string };
export default function DesktopAuthorizePage() {
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState("");
  const id = new URLSearchParams(window.location.search).get("request");
  useEffect(() => {
    let active = true;
    if (!id || !/^[0-9a-f-]{36}$/i.test(id)) { setError("Tautan perangkat tidak valid."); return; }
    desktopWebApi<Pairing>(`pairings/${id}`).then(data => { if (active) setPairing(data); })
      .catch(e => { if (active) setError(e.message); });
    supabase.auth.getUser().then(({ data }) => { if (active) setEmail(data.user?.email || ""); });
    return () => { active = false; };
  }, [id]);
  const decide = async (approve: boolean) => {
    setBusy(true); setError("");
    try {
      await desktopWebApi(`pairings/${id}/decision`, { user_code: code, approve });
      setDone(approve ? "Perangkat terhubung" : "Permintaan ditolak");
    } catch (e) { setError(e instanceof Error ? e.message : "Permintaan gagal."); }
    finally { setBusy(false); }
  };
  return <main className="min-h-screen bg-background px-5 py-10 text-foreground">
    <div className="mx-auto max-w-lg space-y-7">
      <img src="/logo-marison.png" alt="Marison" className="h-12 w-auto object-contain" />
      <header className="border-b pb-5">
        <p className="mb-2 text-sm font-medium text-primary">SIGAP Staging</p>
        <h1 className="text-2xl font-semibold">{done || "Hubungkan aplikasi desktop"}</h1>
        {email && <p className="mt-2 break-all text-sm text-muted-foreground">{email}</p>}
      </header>
      {done ? <section className="space-y-5"><CheckCircle2 className="h-10 w-10 text-primary" />
        <p>Kembali ke aplikasi desktop Anda.</p><Button asChild variant="outline"><Link to="/settings/devices">Perangkat terhubung</Link></Button>
      </section> : <>
        {pairing && <section className="space-y-6">
          <div className="flex items-start gap-3"><Monitor className="mt-1 h-6 w-6 shrink-0 text-primary" /><div className="min-w-0">
            <h2 className="break-words text-lg font-semibold">{pairing.device_name}</h2><p className="text-sm text-muted-foreground">{pairing.platform === "macos" ? "macOS" : "Windows"}</p>
          </div></div>
          <div className="flex gap-3 border-y py-4"><ShieldCheck className="h-5 w-5 shrink-0 text-primary" /><p className="text-sm">Izinkan membaca profil dan notifikasi Anda, serta menandai notifikasi sudah dibaca. Tidak memberikan akses administrasi atau persetujuan surat.</p></div>
          <form onSubmit={e => { e.preventDefault(); void decide(true); }} className="space-y-4">
            <div className="space-y-2"><Label htmlFor="device-code">Kode 8 digit dari aplikasi Anda</Label>
              <Input id="device-code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" autoComplete="off" maxLength={8} required pattern="[0-9]{8}" />
            </div>
            <p className="text-sm text-muted-foreground">Jangan hubungkan perangkat yang tidak Anda gunakan.</p>
            <div className="flex flex-wrap gap-3"><Button type="submit" disabled={busy || code.length !== 8}>{busy ? "Memproses..." : "Hubungkan perangkat"}</Button>
              <Button type="button" variant="outline" disabled={busy || code.length !== 8} onClick={() => void decide(false)}>Tolak</Button>
            </div>
          </form>
          <Button variant="ghost" disabled={busy} onClick={async () => { await supabase.auth.signOut(); window.location.reload(); }}>Ganti akun</Button>
        </section>}
        {!pairing && !error && <p role="status">Memuat permintaan perangkat...</p>}
      </>}
      {error && <p role="alert" className="rounded-md border border-destructive/40 p-3 text-sm text-destructive">{error}</p>}
    </div>
  </main>;
}
