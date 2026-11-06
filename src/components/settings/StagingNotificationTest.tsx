import { useEffect, useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { notificationService } from '@/services/notification.service';

export function StagingNotificationTest({ userId }: { userId: string }) {
  const [busy, setBusy] = useState(false);
  const [remaining, setRemaining] = useState(0);
  const [message, setMessage] = useState('');
  const pending = useRef(false);
  const cooldownDeadline = useRef(0);
  const cooling = remaining > 0;
  const staging = ['https://sigap.marison-testing.biz.id', 'https://sigap.marison-testing.biz.id/']
    .includes(import.meta.env.VITE_APP_PUBLIC_URL);

  useEffect(() => {
    if (!cooling) return;
    const timer = setInterval(() => setRemaining(Math.max(0, Math.ceil((cooldownDeadline.current - Date.now()) / 1000))), 1000);
    return () => clearInterval(timer);
  }, [cooling]);

  const sendTest = async () => {
    if (!staging || !userId || pending.current || cooling || Date.now() < cooldownDeadline.current) return;
    pending.current = true;
    setBusy(true);
    setMessage('');
    try {
      const result = await notificationService.createNotification(
        userId, 'Tes notifikasi SIGAP',
        'Ini adalah notifikasi pengujian staging untuk akun Anda.', 'info', '/dashboard',
      );
      if (result?.inserted !== 1) throw new Error('Test notification was not created');
      cooldownDeadline.current = Date.now() + 30_000;
      setRemaining(30);
      setMessage('Notifikasi tes dibuat untuk akun Anda. Popup mengikuti izin browser dan pembatasan tester staging.');
    } catch {
      setMessage('Notifikasi tes belum dapat dikirim. Coba lagi.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  if (!staging || !userId) return null;
  return <div className="max-w-lg space-y-2">
    <Button type="button" variant="outline" size="sm" className="w-52 max-w-full justify-center" disabled={busy || cooling}
      onClick={() => { void sendTest(); }}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      {busy ? 'Mengirim tes...' : cooling ? `Tes lagi dalam ${remaining} dtk` : 'Tes notifikasi'}
    </Button>
    {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
  </div>;
}
