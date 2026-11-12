import {BellRing} from 'lucide-react';
import {BrowserNotificationButton} from './BrowserNotificationButton';
import {StagingNotificationTest} from './StagingNotificationTest';

export function NotificationPreferences({userId}:{userId:string}) {
 return <section className="space-y-5 border-y py-5"><h2 className="flex items-center gap-2 text-lg font-semibold"><BellRing className="h-5 w-5"/>Notifikasi</h2><div className="flex flex-wrap items-start gap-3"><BrowserNotificationButton/><StagingNotificationTest key={userId} userId={userId}/></div>
 </section>;
}
