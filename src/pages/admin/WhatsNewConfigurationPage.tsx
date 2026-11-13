import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, Loader2, RefreshCw, Save, Send, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { maintenanceDate } from '@/services/maintenance.service';
import { releaseNoticeService, type ReleaseNotice, type ReleaseNoticeAdmin } from '@/services/release-notice.service';
import { releaseIsCurrent } from '@/components/app/WhatsNewNotice';

export default function WhatsNewConfigurationPage() {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['release-notice-admin'], queryFn: releaseNoticeService.admin, retry: false });
  const [content, setContent] = useState('');
  const [revision, setRevision] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState<string[] | null>(null);
  const [confirm, setConfirm] = useState<'publish' | 'withdraw'>('publish');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  useEffect(() => {
    if (query.data && revision === null) { setContent(query.data.draftContent); setRevision(query.data.revision); }
  }, [query.data, revision]);
  const items = content.split('\n').map(line => line.trim()).filter(Boolean);
  const valid = content.trim().length >= 5 && content.length <= 1500 && content.split('\n').length <= 10;
  const changedElsewhere = revision !== null && query.data && revision !== query.data.revision;
  const apply = (state: ReleaseNoticeAdmin) => {
    client.setQueryData(['release-notice-admin'], state); setRevision(state.revision);
    setContent(state.draftContent); setDirty(false); setError('');
  };
  const reload = async () => {
    const result = await query.refetch();
    if (result.data) apply(result.data);
  };
  const update = async (action: 'save' | 'publish' | 'withdraw') => {
    if (lock.current || revision === null) return;
    lock.current = true; setSaving(true); setError('');
    try {
      const state = await releaseNoticeService.update(action, revision,
        action === 'withdraw' ? undefined : content, action === 'withdraw' ? query.data?.release?.id : undefined);
      if (action === 'withdraw' && dirty) {
        client.setQueryData(['release-notice-admin'], state); setRevision(state.revision);
      } else apply(state);
      setConfirmOpen(false);
      await client.invalidateQueries({ queryKey: ['release-notice'] });
      toast.success(action === 'save' ? 'Draft disimpan.' : action === 'publish' ? 'Pengumuman diterbitkan.' : 'Pengumuman ditarik.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Pengumuman belum dapat disimpan.'); }
    finally { lock.current = false; setSaving(false); }
  };
  if (query.isPending) return <div role="status" className="flex items-center gap-2 py-10"><Loader2 className="h-5 w-5 animate-spin" />Memuat pengumuman...</div>;
  if (query.isError && !query.data) return <div role="alert" className="space-y-3 border-y py-6"><p>Pengumuman belum dapat dimuat.</p><Button variant="outline" onClick={() => { void query.refetch(); }}><RefreshCw className="h-4 w-4" />Coba lagi</Button></div>;
  const state = query.data!;
  const active = state.release && releaseIsCurrent(state.release, Date.parse(state.serverNow));
  const previewRelease = (release: ReleaseNotice) => setPreview(release.items);
  return <div className="space-y-6">
    <section aria-label="Pengumuman aktif" className="flex flex-wrap items-start justify-between gap-4 border-y py-4">
      <div className="min-w-0"><h3 className="text-base font-semibold">{active ? 'Pengumuman sedang tampil' : 'Tidak ada pengumuman aktif'}</h3>
        {active && <p className="mt-1 text-sm text-muted-foreground">Berlaku sampai {maintenanceDate(state.release!.expiresAt)}</p>}</div>
      {active && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => previewRelease(state.release!)}><Eye className="h-4 w-4" />Lihat pengumuman</Button>
        <Button variant="outline" disabled={saving || !!changedElsewhere} onClick={() => { setError(''); setConfirm('withdraw'); setConfirmOpen(true); }}><EyeOff className="h-4 w-4" />Tarik pengumuman</Button></div>}
    </section>
    <form className="max-w-3xl space-y-4" onSubmit={event => { event.preventDefault(); void update('save'); }}>
      <div className="flex flex-wrap items-center justify-between gap-2"><Label htmlFor="release-content">Isi pembaruan</Label><span className="text-xs text-muted-foreground">{dirty ? 'Perubahan belum disimpan' : state.revision === 0 ? 'Belum ada draft' : `Draft tersimpan${state.updatedAt ? ` · ${maintenanceDate(state.updatedAt)}` : ''}`}</span></div>
      <Textarea id="release-content" rows={9} maxLength={1500} value={content} disabled={saving}
        placeholder={'Perbaikan: Penulisan data pengajuan dana\nPenambahan: Pengingat pekerjaan'}
        onChange={event => { setContent(event.target.value); setDirty(true); }} />
      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground"><span>{content.length}/1500 karakter</span><span>{content.split('\n').length}/10 baris</span></div>
      {(error || changedElsewhere) && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error || 'Pengumuman telah diubah admin lain. Muat ulang dahulu.'}</p><Button variant="outline" type="button" disabled={saving} onClick={() => { void reload(); }}><RefreshCw className="h-4 w-4" />Muat ulang</Button></div>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="outline" disabled={saving || revision === null || !!changedElsewhere || content.split('\n').length > 10}><Save className="h-4 w-4" />Simpan draft</Button>
        <Button type="button" variant="outline" disabled={!items.length || saving} onClick={() => setPreview(items)}><Eye className="h-4 w-4" />Pratinjau</Button>
        <Button type="button" disabled={!valid || saving || revision === null || !!changedElsewhere} onClick={() => { setError(''); setConfirm('publish'); setConfirmOpen(true); }}><Send className="h-4 w-4" />Terbitkan</Button>
      </div>
    </form>
    <section aria-label="Riwayat pengumuman" className="border-t pt-5"><h3 className="mb-3 text-sm font-semibold">Riwayat pengumuman</h3>
      {!state.history.length ? <p className="py-4 text-sm text-muted-foreground">Belum ada pengumuman diterbitkan.</p> : <ul className="divide-y">{state.history.map(event => <li key={event.revision} className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm">
        <div className="min-w-0"><p className="font-medium">{event.action === 'publish' ? 'Diterbitkan' : 'Ditarik'} · {event.actorName}</p><p className="mt-1 text-xs text-muted-foreground">{maintenanceDate(event.at)}</p></div>
        {event.release && <Button variant="ghost" size="sm" onClick={() => previewRelease(event.release!)}><Eye className="h-4 w-4" />Lihat isi</Button>}
      </li>)}</ul>}
    </section>
    <Dialog open={preview !== null} onOpenChange={open => { if (!open) setPreview(null); }}><DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl"><DialogHeader>
      <Sparkles className="mb-2 h-6 w-6 text-primary" /><DialogTitle>What's New di SIGAP</DialogTitle><DialogDescription>Pembaruan layanan SIGAP.</DialogDescription></DialogHeader>
      <ul className="divide-y">{preview?.map((item, index) => <li key={index} className="whitespace-pre-wrap break-words py-3 text-sm leading-relaxed">{item}</li>)}</ul>
      <DialogFooter><Button onClick={() => setPreview(null)}>Tutup pratinjau</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={confirmOpen} onOpenChange={open => { if (!saving) setConfirmOpen(open); }}><DialogContent><DialogHeader>
      <DialogTitle>{confirm === 'publish' ? 'Terbitkan pembaruan?' : 'Tarik pengumuman?'}</DialogTitle>
      <DialogDescription>{confirm === 'publish' ? 'Isi editor akan disimpan dan ditampilkan kepada pengguna sampai pukul 00.00 WIB berikutnya. Jadwal maintenance tidak berubah.' : 'Pengumuman tidak akan tampil lagi. Riwayat publikasi tetap disimpan.'}</DialogDescription>
    </DialogHeader>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DialogFooter>
      <Button variant="outline" disabled={saving} onClick={() => setConfirmOpen(false)}>Kembali</Button>
      <Button disabled={saving || !!changedElsewhere} onClick={() => { void update(confirm); }}>{saving && <Loader2 className="h-4 w-4 animate-spin" />}{confirm === 'publish' ? 'Ya, terbitkan' : 'Ya, tarik'}</Button>
    </DialogFooter></DialogContent></Dialog>
  </div>;
}
