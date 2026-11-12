import { useId, useRef, useState } from 'react';
import { BellPlus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { BrowserNotificationButton } from '@/components/settings/BrowserNotificationButton';
import { getPersonalReminder, savePersonalReminder, reminderTimeIso, reminderTimeWib, type PersonalReminder, type ReminderKind } from '@/services/personal-reminder.service';

export function PersonalReminderButton({ kind, targetId }: { kind: ReminderKind; targetId: string }) {
  // A changed target gets its own state; an old response cannot populate it.
  return <ReminderEditor key={`${kind}:${targetId}`} kind={kind} targetId={targetId} />;
}

function ReminderEditor({ kind, targetId }: { kind: ReminderKind; targetId: string }) {
  const [open, setOpen] = useState(false), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<PersonalReminder | null>(null);
  const [enabled, setEnabled] = useState(false), [time, setTime] = useState(''), [popup, setPopup] = useState(false);
  const [error, setError] = useState(''), [message, setMessage] = useState('');
  const generation = useRef(0), busy = useRef(false), inputId = useId();
  const load = async () => {
    const request = ++generation.current;
    setLoading(true); setError(''); setSaved(null);
    try {
      const reminder = await getPersonalReminder(kind, targetId);
      if (request !== generation.current) return;
      setSaved(reminder); setEnabled(reminder.status === 'scheduled');
      setTime(reminder.remind_at ? reminderTimeWib(reminder.remind_at) : ''); setPopup(reminder.popup ?? false);
    } catch { if (request === generation.current) setError('Pengingat belum dapat dimuat. Coba lagi.'); }
    finally { if (request === generation.current) setLoading(false); }
  };
  const save = async () => {
    if (!saved || busy.current) return;
    const at = enabled ? reminderTimeIso(time) : null;
    if (enabled && (!at || Date.parse(at) <= Date.now())) { setError('Pilih tanggal dan jam di masa mendatang.'); return; }
    busy.current = true; setSaving(true); setError(''); setMessage('');
    try {
      setSaved(await savePersonalReminder(kind, targetId, at, enabled && popup, saved.version));
      setMessage(enabled ? 'Pengingat pribadi tersimpan.' : 'Pengingat pribadi dinonaktifkan.');
      setOpen(false);
    } catch (thrown) {
      const code = (thrown as { code?: string })?.code;
      setError(code === '40001' ? 'Pengingat telah berubah. Muat ulang sebelum menyimpan.' : 'Pengingat belum dapat disimpan. Coba lagi.');
    } finally { busy.current = false; setSaving(false); }
  };
  return <>
    <Popover open={open} onOpenChange={value => {
      if (busy.current) return;
      setOpen(value);
      if (value) { setMessage(''); void load(); } else ++generation.current;
    }}>
      <PopoverTrigger asChild><Button type="button" variant="outline" size="icon" title="Atur pengingat pribadi" aria-label="Atur pengingat pribadi"><BellPlus className="h-4 w-4" /></Button></PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)] space-y-4">
        <h3 className="text-sm font-semibold">Pengingat pribadi</h3>
        {loading ? <div role="status" className="flex items-center gap-2 text-sm"><Loader2 className="h-4 w-4 animate-spin" />Memuat pengingat...</div> : <>
          {saved && <>
            <label className="flex items-center justify-between gap-3 text-sm"><span>Aktifkan pengingat</span><Switch aria-label="Aktifkan pengingat" checked={enabled} disabled={saving} onCheckedChange={setEnabled} /></label>
            {saved.status === 'sent' && <p className="text-xs text-muted-foreground">Pengingat sebelumnya sudah dikirim.</p>}
            {enabled && <>
              <div className="space-y-2"><label htmlFor={inputId} className="text-sm">Waktu pengingat (WIB)</label><Input id={inputId} type="datetime-local" value={time} disabled={saving} onChange={event => setTime(event.target.value)} /></div>
              <label className="flex items-center justify-between gap-3 text-sm"><span>Popup browser</span><Switch aria-label="Popup browser" checked={popup} disabled={saving} onCheckedChange={setPopup} /></label>
              {popup && <BrowserNotificationButton />}
            </>}
            <Button type="button" className="w-full" disabled={saving} onClick={() => { void save(); }}>{saving ? 'Menyimpan...' : 'Simpan pengingat'}</Button>
          </>}
          {error && <div role="alert" className="space-y-2 text-sm text-destructive"><p>{error}</p><Button type="button" variant="outline" size="sm" disabled={saving} onClick={() => { void load(); }}>Muat ulang pengingat</Button></div>}
        </>}
      </PopoverContent>
    </Popover>
    <span role="status" className="sr-only">{message}</span>
  </>;
}
