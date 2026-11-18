import {BellRing} from 'lucide-react';
import {BrowserNotificationButton} from './BrowserNotificationButton';
import {StagingNotificationTest} from './StagingNotificationTest';

export function NotificationPreferences({userId}:{userId:string}) {
 return <section id="notifikasi" className="grid scroll-mt-20 gap-3 py-5 sm:grid-cols-[minmax(9rem,1fr)_2fr] sm:items-start" aria-labelledby="settings-notifications">
   <h2 id="settings-notifications" className="flex items-center gap-2 text-base font-semibold"><BellRing className="h-4 w-4 text-muted-foreground" aria-hidden="true" />Notifikasi</h2>
   <div className="flex flex-wrap items-start gap-2"><BrowserNotificationButton/><StagingNotificationTest key={userId} userId={userId}/></div>
 </section>;
}
