import { useState } from 'react';
import { motion } from 'framer-motion';
import { format, isValid } from 'date-fns';
import { Search, FileEdit, Plus, CheckCircle, Trash2, LogIn } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { ActivityLog, User, Agenda } from '@/types/agenda';
import { cn } from '@/lib/utils';

interface ActivityLogsViewProps {
  logs: ActivityLog[];
  users: User[];
  agendas: Agenda[];
  currentUser: User | null;
}

const getActionConfig = (action: string, newData?: any) => {
  const normalizedAction = action?.toUpperCase();
  if (normalizedAction === 'UPDATE' && newData?.status === 'Completed') {
    return { icon: CheckCircle, color: 'bg-emerald-500/10 text-emerald-600' };
  }
  const configs: Record<string, { icon: any; color: string }> = {
    INSERT: { icon: Plus, color: 'bg-emerald-500/10 text-emerald-600' },
    CREATE: { icon: Plus, color: 'bg-emerald-500/10 text-emerald-600' },
    UPDATE: { icon: FileEdit, color: 'bg-blue-500/10 text-blue-600' },
    DELETE: { icon: Trash2, color: 'bg-rose-500/10 text-rose-600' },
    LOGIN: { icon: LogIn, color: 'bg-indigo-500/10 text-indigo-600' },
  };
  return configs[normalizedAction] || { icon: FileEdit, color: 'bg-muted text-muted-foreground' };
};

export const ActivityLogsView = ({ logs, users, agendas, currentUser }: ActivityLogsViewProps) => {
  const [selectedLog, setSelectedLog] = useState<ActivityLog | null>(null);

  const tableLabels: Record<string, string> = {
    agendas: 'Agenda',
    profiles: 'Profil pengguna',
    surat_registrasi: 'Surat',
    surat_signatures: 'Tanda tangan surat',
    surat_attachments: 'Lampiran surat',
    notifications: 'Notifikasi',
    master_entities: 'Entitas',
    master_offices: 'Kantor',
    master_department_aliases: 'Alias departemen',
    master_departments: 'Departemen',
    master_letter_types: 'Jenis surat',
    master_forms: 'Form surat',
    master_form_presets: 'Preset form',
    master_penggunaan_detail: 'Detail penggunaan',
    master_projects: 'Proyek',
    department_kpi_configs: 'Konfigurasi SLA',
    external_data_sources: 'Sumber data eksternal',
    'auth.users': 'Akun login',
  };

  const fieldLabels: Record<string, string> = {
    full_name: 'Nama pengguna',
    email: 'Email',
    nik: 'NIK',
    job_title: 'Jabatan',
    role: 'Role akses',
    phone: 'Nomor HP',
    office_id: 'Kantor/cabang',
    department_id: 'Departemen',
    parent_id: 'Atasan',
    is_active: 'Status akun',
    title: 'Judul',
    description: 'Deskripsi',
    location: 'Lokasi',
    status: 'Status',
    judul_surat: 'Judul surat',
    status_surat: 'Status surat',
    dept_id: 'Departemen tujuan',
    current_step: 'Tahap berjalan',
    is_signed: 'Status tanda tangan',
    signed_at: 'Waktu tanda tangan',
    note: 'Catatan',
    file_name: 'Nama file',
    file_url: 'File',
  };

  const hiddenFields = new Set([
    'id',
    'created_at',
    'updated_at',
    'deleted_at',
    'last_signer_change_at',
    'creator_seen_at',
    'requester_seen_at',
    'seen_at',
    'read_at',
    'last_read_at',
  ]);

  const formatAuditValue = (field: string, value: any) => {
    if (value === null || value === undefined || value === '') return 'Kosong';
    if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak';
    if (typeof value === 'object') return JSON.stringify(value, null, 2);
    const text = String(value);
    if ((/(_at|date|time)$/i.test(field) || /^\d{4}-\d{2}-\d{2}T/.test(text)) && isValid(new Date(text))) {
      return format(new Date(text), 'dd MMM yyyy, HH:mm');
    }
    return text;
  };

  const getActionLabel = (action?: string) => {
    switch (action?.toUpperCase()) {
      case 'INSERT':
      case 'CREATE':
        return 'Data dibuat';
      case 'UPDATE':
        return 'Data diperbarui';
      case 'DELETE':
        return 'Data dihapus';
      case 'LOGIN':
        return 'Login';
      default:
        return action || '-';
    }
  };

  const getObjectTitle = (log: ActivityLog) => {
    const data = log.newValues || log.oldValues || {};
    const tableName = log.tableName || log.table_name || '';
    return (
      data.title ||
      data.judul_surat ||
      data.full_name ||
      data.name ||
      data.file_name ||
      tableLabels[tableName] ||
      tableName ||
      'Data'
    );
  };

  const getChangedFields = (log: ActivityLog) => {
    if (!log.oldValues || !log.newValues) return [];
    return Object.keys({ ...log.oldValues, ...log.newValues })
      .filter((key) => !hiddenFields.has(key))
      .filter((key) => JSON.stringify(log.oldValues?.[key] ?? null) !== JSON.stringify(log.newValues?.[key] ?? null))
      .slice(0, 4);
  };

  const getDetailFields = (log: ActivityLog) => {
    const action = log.action?.toUpperCase();
    const oldValues = log.oldValues || {};
    const newValues = log.newValues || {};
    const source = action === 'DELETE' ? oldValues : newValues;
    const keys = Object.keys({ ...oldValues, ...newValues })
      .filter((key) => !hiddenFields.has(key));

    return keys
      .map((key) => ({
        key,
        label: fieldLabels[key] || key.replace(/_/g, ' '),
        before: oldValues[key],
        after: newValues[key],
        changed: JSON.stringify(oldValues[key] ?? null) !== JSON.stringify(newValues[key] ?? null),
      }))
      .filter((item) => action === 'UPDATE' ? item.changed : source[item.key] !== undefined)
      .slice(0, 24);
  };
  
  const getLogDescription = (log: ActivityLog) => {
    const action = log.action?.toUpperCase();
    const tableName = log.tableName || log.table_name || '';
    const objectLabel = tableLabels[tableName] || tableName || 'Data';
    const title = getObjectTitle(log);
    const changedFields = getChangedFields(log)
      .map((field) => fieldLabels[field] || field)
      .join(', ');

    switch (action) {
      case 'INSERT':
      case 'CREATE':
        return `Membuat ${objectLabel}: "${title}"`;
      case 'DELETE':
        return `Menghapus ${objectLabel}: "${title}"`;
      case 'UPDATE':
        if (log.newValues?.event === 'password_changed') return 'Mengubah password akun';
        if (log.newValues?.status === 'Completed') return `Menyelesaikan ${objectLabel}: "${title}"`;
        return changedFields
          ? `Memperbarui ${objectLabel}: "${title}" (${changedFields})`
          : `Memperbarui ${objectLabel}: "${title}"`;
      default:
        return `Aktivitas ${objectLabel}: "${title}"`;
    }
  };

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse table-fixed">
          <thead className="bg-muted/40 border-b border-border/50">
            <tr>
              <th className="w-24 px-6 py-4 text-center text-xs font-semibold text-muted-foreground">Tipe</th>
              <th className="w-64 px-6 py-4 text-xs font-semibold text-muted-foreground">Pelaku</th>
              <th className="px-6 py-4 text-xs font-semibold text-muted-foreground">Keterangan aktivitas</th>
              <th className="w-48 px-6 py-4 text-right text-xs font-semibold text-muted-foreground">Waktu</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/40">
            {logs.length > 0 ? (
              logs.map((log, idx) => {
                const actor = users.find(u => String(u.id) === String(log.userId || log.user_id));
                const hasActor = Boolean(log.userId || log.user_id);
                const actorName = log.profiles?.fullName || actor?.fullName || 'Sistem Audit';
                const { icon: Icon, color: colorClass } = getActionConfig(log.action, log.newValues);
                const logDate = new Date(log.createdAt || Date.now());

                return (
                  <motion.tr
                    key={`${log.id}-${idx}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => setSelectedLog(log)}
                    className="hover:bg-primary/[0.03] transition-colors group cursor-pointer"
                  >
                    <td className="px-6 py-4 text-center">
                      <div className={cn("inline-flex rounded-lg p-2.5 transition-colors", colorClass)}>
                        <Icon className="w-5 h-5" />
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-4">
                        <Avatar className="h-10 w-10 border-2 border-background shadow-sm">
                          <AvatarImage src={log.profiles?.avatarUrl || actor?.photoUrl} />
                          <AvatarFallback className="text-[10px] font-bold bg-primary/5">
                            {actorName.substring(0, 2).toUpperCase()}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col truncate">
                          <span className="font-bold text-sm truncate leading-tight mb-1">
                            {String(log.userId) === String(currentUser?.id) ? 'Anda' : actorName}
                          </span>
                          <span className="text-xs font-medium text-primary/80">
                            {actor?.role || (hasActor ? 'User' : 'Audit Otomatis')}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-sm font-medium text-foreground/90 leading-relaxed">
                        {getLogDescription(log)}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Klik untuk melihat detail perubahan
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="text-xs font-semibold text-foreground/80">{isValid(logDate) ? format(logDate, 'dd MMM yyyy') : '-'}</div>
                      <div className="text-xs text-muted-foreground">
                        pukul {isValid(logDate) ? format(logDate, 'HH:mm') : '-'}
                      </div>
                    </td>
                  </motion.tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={4} className="py-32 text-center">
                  <div className="flex flex-col items-center opacity-20 italic">
                    <Search className="h-12 w-12 mb-2" />
                    <p className="text-base font-semibold">Tidak ada data audit</p>
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-3xl overflow-hidden p-0">
          {selectedLog && (() => {
            const actor = users.find(u => String(u.id) === String(selectedLog.userId || selectedLog.user_id));
            const actorName = selectedLog.profiles?.fullName || actor?.fullName || 'Sistem Audit';
            const tableName = selectedLog.tableName || selectedLog.table_name || '';
            const logDate = new Date(selectedLog.createdAt || Date.now());
            const detailFields = getDetailFields(selectedLog);
            const { icon: Icon, color: colorClass } = getActionConfig(selectedLog.action, selectedLog.newValues);

            return (
              <div className="flex max-h-[82vh] flex-col bg-background">
                <div className="border-b border-border bg-muted/30 px-6 py-5">
                  <div className="flex items-start gap-4">
                    <div className={cn("mt-1 rounded-xl p-2.5", colorClass)}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1 pr-8">
                      <p className="text-xs font-medium text-muted-foreground">Detail audit</p>
                      <DialogTitle className="mt-1 text-lg font-semibold leading-snug text-foreground">{getLogDescription(selectedLog)}</DialogTitle>
                      <DialogDescription className="mt-2 text-xs font-medium text-muted-foreground">
                        {actorName} - {isValid(logDate) ? format(logDate, 'dd MMM yyyy, HH:mm') : '-'}
                      </DialogDescription>
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 border-b border-border px-6 py-4 text-xs sm:grid-cols-3">
                  <div>
                    <p className="font-medium text-muted-foreground">Data</p>
                    <p className="mt-1 font-semibold text-foreground">{tableLabels[tableName] || tableName || '-'}</p>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground">ID rekaman</p>
                    <p className="mt-1 break-all font-mono text-[11px] text-foreground">{selectedLog.recordId || selectedLog.record_id || '-'}</p>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground">Aksi</p>
                    <p className="mt-1 font-semibold text-foreground">{getActionLabel(selectedLog.action)}</p>
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5">
                  {detailFields.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border bg-muted/20 p-6 text-center text-sm text-muted-foreground">
                      Tidak ada perubahan field yang bisa ditampilkan.
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {detailFields.map((field) => (
                        <div key={field.key} className="rounded-xl border border-border bg-card p-4">
                          <p className="mb-3 text-sm font-semibold text-foreground">{field.label}</p>
                          {selectedLog.action?.toUpperCase() === 'UPDATE' ? (
                            <div className="grid gap-3 md:grid-cols-2">
                              <div>
                                <p className="mb-1 text-xs font-medium text-muted-foreground">Sebelum</p>
                                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">{formatAuditValue(field.key, field.before)}</pre>
                              </div>
                              <div>
                                <p className="mb-1 text-xs font-medium text-muted-foreground">Sesudah</p>
                                <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-primary/5 p-3 text-xs font-semibold text-foreground">{formatAuditValue(field.key, field.after)}</pre>
                              </div>
                            </div>
                          ) : (
                            <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-muted/50 p-3 text-xs text-foreground">
                              {formatAuditValue(field.key, selectedLog.action?.toUpperCase() === 'DELETE' ? field.before : field.after)}
                            </pre>
                          )}
                          {selectedLog.action?.toUpperCase() === 'UPDATE' && (
                            <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
                              {field.label} diubah dari <span className="font-semibold text-foreground">{formatAuditValue(field.key, field.before)}</span> menjadi <span className="font-semibold text-foreground">{formatAuditValue(field.key, field.after)}</span>.
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </>
  );
};
