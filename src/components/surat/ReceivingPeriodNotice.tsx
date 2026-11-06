import {CalendarDays} from 'lucide-react';
export function ReceivingPeriodNotice({availableAt,note}:{availableAt?:string|null;note?:string|null}) {
 if(!availableAt||!(Date.parse(availableAt)>Date.now()))return null;
 return <div className="space-y-1 text-xs"><span className="inline-flex items-center gap-1.5 text-amber-800 dark:text-amber-300"><CalendarDays className="h-3.5 w-3.5 shrink-0"/>Menunggu periode penerimaan</span><p className="text-muted-foreground">Mulai {new Date(availableAt).toLocaleString('id-ID',{timeZone:'Asia/Jakarta',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})} WIB</p>{note&&<p className="whitespace-pre-line break-words text-muted-foreground">{note}</p>}</div>;
}
