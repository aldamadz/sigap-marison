import { BrowserNotificationButton } from './BrowserNotificationButton';
import { StagingNotificationTest } from './StagingNotificationTest';

export function NotificationPreferences({ userId }: { userId: string }) {
  return <section id="notifikasi" className="scroll-mt-20 space-y-2" aria-labelledby="settings-notifications">
    <h3 id="settings-notifications" className="text-sm font-medium">Notifikasi</h3>
    <BrowserNotificationButton />
    <StagingNotificationTest key={userId} userId={userId} />
  </section>;
}
