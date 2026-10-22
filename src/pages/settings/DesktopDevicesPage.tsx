import { useCallback, useEffect, useState } from "react";
import { Monitor, RefreshCw, ShieldX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { desktopWebApi } from "@/lib/desktop-api";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";

type Device = { id: string; user_id: string; full_name?: string; device_name: string; platform: string; refreshed_at: string; expires_at: string; revoked_at: string | null };
export default function DesktopDevicesPage({ admin = false }: { admin?: boolean }) {
  const [rows, setRows] = useState<Device[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Device | null>(null);
  const prefix = admin ? "admin/devices" : "devices";
  const load = useCallback(async () => {
    setBusy(true); setError("");
    try { setRows((await desktopWebApi<{ devices: Device[] }>(prefix)).devices); }
    catch (e) { setError(e instanceof Error ? e.message : "Tidak dapat memuat perangkat."); }
    finally { setBusy(false); }
  }, [prefix]);
  useEffect(() => { void load(); }, [load]);
  const revoke = async () => {
    if (!selected) return;
    setBusy(true);
    try { await desktopWebApi(`${prefix}/${selected.id}/revoke`, {}); setSelected(null); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : "Gagal mencabut akses."); setBusy(false); }
  };
  return <section className="mx-auto w-full max-w-5xl space-y-5">
    <header className="flex items-start justify-between gap-4 border-b pb-5"><div><h1 className="text-xl font-semibold">Perangkat terhubung</h1><p className="mt-1 text-sm text-muted-foreground">{admin ? "Sesi aplikasi desktop seluruh pengguna di staging." : "Aplikasi desktop yang terhubung ke akun Anda."}</p></div>
      <Button variant="outline" size="icon" title="Muat ulang" aria-label="Muat ulang" disabled={busy} onClick={() => void load()}><RefreshCw className="h-4 w-4" /></Button>
    </header>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {busy && <p role="status" className="text-sm text-muted-foreground">Memuat perangkat...</p>}
    {!busy && !error && !rows.length && <p className="py-8 text-sm text-muted-foreground">Belum ada perangkat terhubung.</p>}
    <ul className="divide-y">{rows.map(row => {
      const inactive = !!row.revoked_at || Date.parse(row.expires_at) <= Date.now();
      return <li key={row.id} className="flex flex-wrap items-start gap-4 py-4"><Monitor className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" /><div className="min-w-0 flex-1">
        <h2 className="break-words text-base font-semibold">{row.device_name}</h2>
        <p className="break-words text-sm text-muted-foreground">{row.platform === "macos" ? "macOS" : "Windows"}{admin ? ` / ${row.full_name || row.user_id}` : ""}</p>
        <p className="mt-1 text-xs text-muted-foreground">{inactive ? "Tidak aktif" : "Aktif"} / Sesi diperbarui {new Date(row.refreshed_at).toLocaleString("id-ID")}</p>
      </div><Button variant="outline" size="sm" disabled={busy || inactive} onClick={() => setSelected(row)}><ShieldX className="mr-2 h-4 w-4" />Cabut akses</Button></li>;
    })}</ul>
    <AlertDialog open={!!selected} onOpenChange={open => { if (!open && !busy) setSelected(null); }}><AlertDialogContent>
      <AlertDialogHeader><AlertDialogTitle>Cabut akses perangkat?</AlertDialogTitle><AlertDialogDescription className="break-words">{selected?.device_name} harus login kembali. Sesi web SIGAP tetap aktif.</AlertDialogDescription></AlertDialogHeader>
      <AlertDialogFooter><AlertDialogCancel disabled={busy}>Batal</AlertDialogCancel><AlertDialogAction disabled={busy} onClick={e => { e.preventDefault(); void revoke(); }}>Cabut akses</AlertDialogAction></AlertDialogFooter>
    </AlertDialogContent></AlertDialog>
  </section>;
}
