// frontend\src\components\dashboard\RecentActivity.tsx
import { useState, useMemo } from 'react';
import { format, formatDistanceToNow, isValid } from 'date-fns';
import { id as localeID } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { 
  FileEdit, Plus, LogIn, Trash2, History, CheckCircle
} from 'lucide-react';
import { ActivityLog, User } from '@/types/agenda';
import { cn } from '@/lib/utils';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';

interface RecentActivityProps {
  logs: ActivityLog[];
  users: User[];
}

// --- Konfigurasi Visual ---
const actionConfigs: Record<string, { icon: any; color: string; header: string; label: string }> = {
  CREATE: { icon: Plus, label: 'Membuat', color: 'text-emerald-600 bg-emerald-500/10', header: 'bg-emerald-600' },
  INSERT: { icon: Plus, label: 'Membuat', color: 'text-emerald-600 bg-emerald-500/10', header: 'bg-emerald-600' },
  APPROVAL: { icon: CheckCircle, label: 'Approval', color: 'text-emerald-600 bg-emerald-500/10', header: 'bg-emerald-600' },
  UPDATE: { icon: FileEdit, label: 'Memperbarui', color: 'text-blue-600 bg-blue-500/10', header: 'bg-blue-600' },
  DELETE: { icon: Trash2, label: 'Menghapus', color: 'text-rose-600 bg-rose-500/10', header: 'bg-rose-600' },
  LOGIN:  { icon: LogIn, label: 'Masuk', color: 'text-amber-600 bg-amber-500/10', header: 'bg-amber-600' },
};

// --- Utils ---
const formatValue = (key: string, val: any) => {
  if (val === null || val === undefined) return 'Kosong';
  const strVal = String(val);
  const isTime = /time|date|at/i.test(key) || /^\d{4}-\d{2}-\d{2}T/.test(strVal);
  
  if (isTime && isValid(new Date(strVal))) {
    return format(new Date(strVal), "dd MMM yyyy, HH:mm", { locale: localeID });
  }
  return strVal;
};

const fieldLabels: Record<string, string> = {
  title: 'Judul agenda',
  description: 'Deskripsi',
  location: 'Lokasi',
  start_time: 'Waktu mulai',
  end_time: 'Waktu selesai',
  status: 'Status',
  judul_surat: 'Judul surat',
  nomor_surat: 'Nomor surat',
  requester_name: 'Pemohon',
  requester_department: 'Departemen pemohon',
  requester_office: 'Kantor pemohon',
  note: 'Catatan',
  signed_at: 'Waktu approval',
  signer_name: 'Penanda tangan',
  step_order: 'Urutan approval',
};

const importantFieldsByTable: Record<string, string[]> = {
  agendas: ['title', 'description', 'location', 'start_time', 'end_time', 'status'],
  surat_registrasi: ['judul_surat', 'nomor_surat', 'requester_name', 'requester_department', 'requester_office', 'status'],
  surat_signatures: ['signer_name', 'step_order', 'signed_at', 'note'],
};

// --- Komponen Utama ---
export const RecentActivity = ({ logs = [], users = [] }: RecentActivityProps) => {
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'CREATE' | 'APPROVAL'>('ALL');
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  const getActivityCategory = (log: ActivityLog): 'CREATE' | 'APPROVAL' | 'OTHER' => {
    const action = log.action?.toUpperCase();
    const table = log.tableName || (log as any).table_name;
    if (table === 'surat_signatures' && action === 'UPDATE') return 'APPROVAL';
    if ((table === 'agendas' || table === 'surat_registrasi') && (action === 'INSERT' || action === 'CREATE')) return 'CREATE';
    return 'OTHER';
  };

  const filteredLogs = useMemo(() => {
    const safeLogs = Array.isArray(logs) ? logs : [];
    return activeFilter === 'ALL' 
      ? safeLogs 
      : safeLogs.filter(l => getActivityCategory(l) === activeFilter);
  }, [logs, activeFilter]);

  const getActorInfo = (log: ActivityLog) => {
    const profile = Array.isArray(log.profiles) ? log.profiles[0] : log.profiles;
    const user = users.find(u => String(u.id) === String(log.userId || (log as any).user_id));
    return {
      name: profile?.fullName || profile?.full_name || user?.fullName || 'Sistem',
      avatar: profile?.avatarUrl || (user as any)?.photoUrl
    };
  };

  const getDisplayMessage = (log: ActivityLog) => {
    const oldData = log.oldValues || (log as any).old_values || {};
    const newData = log.newValues || (log as any).new_values || {};
    const title = newData.title || oldData.title || newData.judul_surat || oldData.judul_surat || "";

    const tableMapping: Record<string, string> = {
      agendas: 'agenda',
      surat_registrasi: 'surat',
      surat_signatures: 'approval surat',
    };
    const rawTable = log.tableName || (log as any).table_name || "";
    const entityName = tableMapping[rawTable] || (rawTable ? rawTable.toLowerCase().replace(/s$/, '') : 'agenda');

    if (rawTable === 'surat_signatures') return `menyetujui ${entityName}${title ? ` "${title}"` : ''}`;

    return `membuat ${entityName}${title ? ` "${title}"` : ''}`;
  };

  const renderDiff = (log: ActivityLog) => {
    const oldVal = log.oldValues || (log as any).old_values || {};
    const newVal = log.newValues || (log as any).new_values || {};
    const tableName = log.tableName || (log as any).table_name || '';
    const preferredKeys = importantFieldsByTable[tableName] || [];
    const allKeys = Object.keys({ ...oldVal, ...newVal })
      .filter(k => !['id', 'user_id', 'created_at', 'updated_at', 'deleted_at', 'template_data', 'excel_data', 'snapshot_data'].includes(k));
    const keys = [
      ...preferredKeys.filter(k => allKeys.includes(k)),
      ...allKeys.filter(k => !preferredKeys.includes(k)),
    ].slice(0, 8);

    return (
      <div className="space-y-3">
        {keys.map(key => (
          <div key={key} className="rounded-xl border border-border bg-card p-4">
            <label className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              {fieldLabels[key] || key.replace(/_/g, ' ')}
            </label>
            <div className="mt-2 text-sm">
              {log.action === 'UPDATE' && oldVal[key] !== newVal[key] ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sebelum</p>
                    <div className="rounded-lg bg-muted/50 p-3 text-muted-foreground">{formatValue(key, oldVal[key])}</div>
                  </div>
                  <div>
                    <p className="mb-1 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Sesudah</p>
                    <div className="rounded-lg bg-primary/5 p-3 font-semibold text-foreground">{formatValue(key, newVal[key])}</div>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg bg-muted/50 p-3 font-semibold text-foreground">{formatValue(key, newVal[key] ?? oldVal[key])}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    );
  };

  return (
    <>
      <div className="bg-card rounded-2xl border border-border shadow-sm overflow-hidden flex flex-col h-full">
        <div className="p-6 border-b bg-muted/20 flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <History className="w-5 h-5 text-primary" />
            <h3 className="font-bold">Aktivitas Terbaru</h3>
          </div>
          <div className="flex gap-1 bg-muted p-1 rounded-lg">
            {[
              { value: 'ALL', label: 'Semua' },
              { value: 'CREATE', label: 'Membuat' },
              { value: 'APPROVAL', label: 'Approval' },
            ].map((filter) => (
              <button 
                key={filter.value}
                onClick={() => setActiveFilter(filter.value as any)}
                className={cn(
                  "px-3 py-1 text-[10px] font-bold rounded-md transition-all uppercase", 
                  activeFilter === filter.value ? "bg-background shadow-sm text-primary" : "text-muted-foreground"
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[500px] space-y-4 scrollbar-thin">
          {filteredLogs.length === 0 ? (
            <div className="py-10 text-center text-muted-foreground text-sm italic">Belum ada aktivitas.</div>
          ) : (
            filteredLogs.map((log, i) => {
              const actionKey = getActivityCategory(log) === 'APPROVAL' ? 'APPROVAL' : 'CREATE';
              const config = actionConfigs[actionKey] || actionConfigs.UPDATE;
              
              const actor = getActorInfo(log);
              return (
                <div 
                  key={i} 
                  onClick={() => setSelectedLog(log)}
                  className="flex items-start gap-4 p-3 hover:bg-muted/50 rounded-xl cursor-pointer transition-all group border border-transparent hover:border-border/50"
                >
                  <div className={cn("p-2 rounded-lg shrink-0 shadow-sm transition-colors", config.color)}>
                    <config.icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-relaxed">
                      <span className="font-bold text-foreground">{actor.name}</span> 
                      <span className="text-muted-foreground"> {getDisplayMessage(log)}</span>
                    </p>
                    <span className="text-[10px] text-muted-foreground/60 font-bold uppercase tracking-tighter">
                      {log.createdAt && formatDistanceToNow(new Date(log.createdAt), { addSuffix: true, locale: localeID })}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden rounded-2xl border shadow-2xl">
          {selectedLog && (() => {
             const newData = selectedLog.newValues || (selectedLog as any).new_values || {};
             const category = getActivityCategory(selectedLog);
             const modalConfig = actionConfigs[category === 'APPROVAL' ? 'APPROVAL' : 'CREATE'];
             const actor = getActorInfo(selectedLog);
             const tableName = selectedLog.tableName || (selectedLog as any).table_name || '';
             const tableLabel = tableName === 'agendas' ? 'Agenda' : tableName === 'surat_registrasi' ? 'Surat' : 'Approval surat';
             const logDate = new Date(selectedLog.createdAt || (selectedLog as any).created_at || Date.now());
             
             return (
              <div className="flex max-h-[82vh] flex-col bg-background">
                <div className={cn("px-7 py-6 text-white relative transition-colors", modalConfig.header)}>
                  <p className="text-[10px] font-black uppercase tracking-widest opacity-75 mb-2">Detail Aktivitas</p>
                  <DialogTitle className="pr-8 text-xl font-black leading-tight">{actor.name} {getDisplayMessage(selectedLog)}</DialogTitle>
                  <DialogDescription className="mt-2 text-xs font-semibold text-white/85">
                    {isValid(logDate) ? format(logDate, 'dd MMM yyyy, HH:mm', { locale: localeID }) : '-'}
                  </DialogDescription>
                </div>

                <div className="grid gap-3 border-b border-border px-7 py-4 text-xs sm:grid-cols-3">
                  <div>
                    <p className="font-black uppercase tracking-widest text-muted-foreground">Jenis</p>
                    <p className="mt-1 font-bold text-foreground">{tableLabel}</p>
                  </div>
                  <div>
                    <p className="font-black uppercase tracking-widest text-muted-foreground">Aksi</p>
                    <p className="mt-1 font-bold text-foreground">{category === 'APPROVAL' ? 'Approval' : 'Membuat'}</p>
                  </div>
                  <div>
                    <p className="font-black uppercase tracking-widest text-muted-foreground">Pelaku</p>
                    <p className="mt-1 truncate font-bold text-foreground">{actor.name}</p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-7 scrollbar-thin">
                  {renderDiff(selectedLog)}
                </div>
                <div className="border-t bg-muted/30 p-4 flex justify-end">
                  <button 
                    onClick={() => setSelectedLog(null)}
                    className="px-6 py-2 bg-foreground text-background text-[10px] font-bold uppercase rounded-xl hover:bg-foreground/90 transition-colors"
                  >
                    Tutup
                  </button>
                </div>
              </div>
             )
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
};

// --- Komponen Tabel (ActivityLogsView) ---
export const ActivityLogsView = ({ logs = [], users = [], currentUser }: any) => {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead className="bg-muted/50 border-b">
          <tr>
            <th className="p-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground w-20 text-center">Aksi</th>
            <th className="p-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Pelaku</th>
            <th className="p-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground">Keterangan</th>
            <th className="p-5 text-[10px] font-black uppercase tracking-widest text-muted-foreground text-right">Waktu</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {logs.map((log: any, i: number) => {
            const newData = log.newValues || log.new_values || {};
            const isSoftDelete = log.action?.toUpperCase() === 'UPDATE' && newData.status === 'Deleted';
            const config = actionConfigs[isSoftDelete ? 'DELETE' : log.action?.toUpperCase()] || actionConfigs.UPDATE;
            
            const actorId = log.userId || log.user_id;
            const actor = users.find((u: any) => String(u.id) === String(actorId));
            const logDate = new Date(log.createdAt || log.created_at || Date.now());
            
            const rawTable = log.tableName || log.table_name || "";
            const entityLabel = rawTable === 'agendas' ? 'agenda' : 
                               rawTable === 'profiles' ? 'profil' : 
                               (rawTable ? rawTable.toLowerCase().replace(/s$/, '') : 'agenda');

            return (
              <motion.tr key={i} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="hover:bg-muted/10 transition-colors">
                <td className="p-5 text-center">
                  <div className={cn("inline-flex p-2 rounded-xl", config.color)}>
                    <config.icon className="w-4 h-4" />
                  </div>
                </td>
                <td className="p-5">
                  <div className="flex items-center gap-3">
                    <Avatar className="h-8 w-8 border">
                      <AvatarImage src={actor?.photoUrl || actor?.avatar_url} />
                      <AvatarFallback className="text-[10px]">{actor?.fullName?.charAt(0) || 'S'}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold">
                        {actor?.id === currentUser?.id ? 'Anda' : actor?.fullName || actor?.full_name || 'Sistem'}
                      </span>
                      <span className="text-[9px] uppercase font-black text-primary/60">{actor?.role || 'User'}</span>
                    </div>
                  </div>
                </td>
                <td className="p-5">
                   <p className="text-sm font-medium text-foreground/80">
                     {isSoftDelete ? 'Menghapus' : config.label} {entityLabel}
                   </p>
                </td>
                <td className="p-5 text-right">
                  <div className="text-xs font-bold">
                    {isValid(logDate) ? format(logDate, 'dd MMM yyyy') : '-'}
                  </div>
                  <div className="text-[10px] text-muted-foreground font-medium">
                    {isValid(logDate) ? `pukul ${format(logDate, 'HH:mm')}` : ''}
                  </div>
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
