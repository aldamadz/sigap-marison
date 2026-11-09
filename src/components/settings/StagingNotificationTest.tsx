import { useEffect, useRef, useState } from 'react';
import { BellRing, Loader2, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { notificationService } from '@/services/notification.service';
import { pushService } from '@/services/push.service';

export function StagingNotificationTest({ userId }: { userId: string }) {
  const staging = ['https://sigap.marison-testing.biz.id', 'https://sigap.marison-testing.biz.id/']
    .includes(import.meta.env.VITE_APP_PUBLIC_URL);
  if (!staging || !userId) return null;
  return <div className="flex flex-wrap items-start gap-3">
    <NotificationTestAction userId={userId} mode="popup" />
    <NotificationTestAction userId={userId} mode="delivery" />
  </div>;
}

function NotificationTestAction({ userId, mode }: { userId: string; mode: 'popup' | 'delivery' }) {
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
      if (mode === 'popup') {
        const result = await pushService.testPopup();
        if (!result.requested) {
          setMessage(result.reason === 'permission_not_granted'
            ? 'Izin popup belum diberikan. Izinkan notifikasi pada pengaturan situs browser.'
            : result.reason === 'unsupported' ? 'Browser ini belum mendukung popup notifikasi. Coba Chrome atau Edge.'
              : 'Popup belum dapat ditampilkan. Periksa izin browser lalu coba lagi.');
          return;
        }
        setMessage('Popup tes dikirim ke browser perangkat ini. Jika tidak terlihat, periksa pusat notifikasi dan mode Jangan Ganggu perangkat.');
      } else {
        const result = await notificationService.createNotification(
          userId, 'Tes notifikasi SIGAP',
          'Ini adalah notifikasi pengujian staging untuk akun Anda.', 'info', '/dashboard',
        );
        if (result?.inserted !== 1) throw new Error('Test notification was not created');
        setMessage('Notifikasi tes dibuat untuk akun Anda. Pengiriman push mengikuti langganan browser dan pembatasan tester staging.');
      }
      cooldownDeadline.current = Date.now() + 30_000;
      setRemaining(30);
    } catch {
      setMessage(mode === 'popup' ? 'Popup belum dapat ditampilkan. Periksa izin browser lalu coba lagi.' : 'Notifikasi tes belum dapat dikirim. Coba lagi.');
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  if (!staging || !userId) return null;
  return <div className="max-w-lg space-y-2">
    <Button type="button" variant="outline" size="sm" className="w-52 max-w-full justify-center" disabled={busy || cooling}
      onClick={() => { void sendTest(); }}>
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'popup' ? <BellRing className="h-4 w-4" /> : <Send className="h-4 w-4" />}
      {busy ? 'Mengirim tes...' : cooling ? `Tes lagi dalam ${remaining} dtk` : mode === 'popup' ? 'Tes popup browser' : 'Tes pengiriman SIGAP'}
    </Button>
    {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
  </div>;
}
