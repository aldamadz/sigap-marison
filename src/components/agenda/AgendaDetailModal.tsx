// src/components/agenda/AgendaDetailModal.tsx
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { id as localeID } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Agenda, AgendaStatus, User } from '@/types/agenda';
import { supabase } from '@/lib/supabase';
import { cn } from '@/lib/utils';
import {
  CheckCircle2, Edit2, MapPin, Clock, Calendar,
  Loader2, Tag, FastForward, Lock, Info, Trash2, AlertTriangle,
} from 'lucide-react';

// ── Status config ─────────────────────────────────────────────────────────────
const STATUS_CONFIG: Record<AgendaStatus, { label: string; cls: string; dot: string }> = {
  Scheduled: { label: 'Terjadwal',   cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20',         dot: 'bg-blue-400'         },
  Ongoing:   { label: 'Berlangsung', cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20',       dot: 'bg-amber-400'        },
  Completed: { label: 'Selesai',     cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', dot: 'bg-emerald-400'      },
  Overdue:   { label: 'Terlambat',   cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20',          dot: 'bg-rose-400'         },
  Deleted:   { label: 'Dihapus',     cls: 'bg-muted/50 text-muted-foreground border-border',          dot: 'bg-muted-foreground' },
};

// ── Timezone-safe ISO ─────────────────────────────────────────────────────────
const toLocalIso = (d: Date): string => {
  const pad  = (n: number) => String(n).padStart(2, '0');
  const tz   = -d.getTimezoneOffset();
  const sign = tz >= 0 ? '+' : '-';
  const hh   = pad(Math.floor(Math.abs(tz) / 60));
  const mm   = pad(Math.abs(tz) % 60);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${sign}${hh}:${mm}`
  );
};

// ── Waktu nyata ───────────────────────────────────────────────────────────────
type TimePhase = 'future' | 'ongoing' | 'past';

const getTimePhase = (agenda: Agenda): TimePhase => {
  const now   = Date.now();
  const start = agenda.startTime ? new Date(agenda.startTime).getTime() : 0;
  const end   = agenda.endTime   ? new Date(agenda.endTime).getTime()   : 0;
  if (now < start)                   return 'future';
  if (now >= start && now <= end)    return 'ongoing';
  return 'past';
};

// ── Props ─────────────────────────────────────────────────────────────────────
interface AgendaDetailModalProps {
  agenda: Agenda | null;
  // Mendukung dua variasi: `open` (CalendarPage) dan `isOpen` (AgendaPage)
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  onEdit: (agenda: Agenda) => void;
  // Props tambahan dari AgendaPage
  onStatusChange?: (id: string | number, status: AgendaStatus) => void;
  onDelete?: (id: string | number) => void;
  users?: User[];
  isDeleting?: boolean;
  currentUserId?: string;
}

export const AgendaDetailModal = ({
  agenda,
  open,
  isOpen,
  onClose,
  onEdit,
  onStatusChange,
  onDelete,
  users = [],
  isDeleting = false,
  currentUserId,
}: AgendaDetailModalProps) => {
  const queryClient = useQueryClient();
  const [confirmMode, setConfirmMode] = useState<'selesai' | 'pindah' | 'hapus' | null>(null);

  // Mendukung dua variasi prop name
  const isVisible = open ?? isOpen ?? false;

  // ── Mark Completed ──────────────────────────────────────────────────────────
  const completeMutation = useMutation({
    mutationFn: async () => {
      if (!agenda) return;
      // Jika ada onStatusChange dari parent, delegasikan ke sana
      if (onStatusChange) {
        onStatusChange(agenda.id, 'Completed');
        return;
      }
      const { error } = await supabase
        .from('agendas')
        .update({ status: 'Completed', completed_at: new Date().toISOString() })
        .eq('id', agenda.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agendas'] });
      toast.success('Agenda ditandai selesai');
      setConfirmMode(null);
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.message ?? 'Gagal memperbarui agenda');
      setConfirmMode(null);
    },
  });

  // ── Pindah ke waktu sekarang ────────────────────────────────────────────────
  const rescheduleNowMutation = useMutation({
    mutationFn: async () => {
      if (!agenda) return;
      const durasi   = new Date(agenda.endTime).getTime() - new Date(agenda.startTime).getTime();
      const newStart = new Date();
      const newEnd   = new Date(newStart.getTime() + durasi);
      const { error } = await supabase
        .from('agendas')
        .update({
          start_time: toLocalIso(newStart),
          end_time:   toLocalIso(newEnd),
          status:     'Ongoing',
        })
        .eq('id', agenda.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agendas'] });
      toast.success('Agenda dipindahkan ke waktu sekarang');
      setConfirmMode(null);
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.message ?? 'Gagal memindahkan agenda');
      setConfirmMode(null);
    },
  });

  if (!agenda) return null;

  const phase     = getTimePhase(agenda);
  const st        = STATUS_CONFIG[agenda.status] ?? STATUS_CONFIG.Scheduled;
  const isLocked  = agenda.status === 'Completed' || agenda.status === 'Deleted';
  const isOverdue = agenda.status === 'Overdue';

  // Aturan tombol berdasarkan waktu nyata + status DB
  const canComplete   = !isLocked && !isOverdue && phase !== 'future';
  const canReschedule = !isLocked && !isOverdue && phase === 'future';
  const canEdit       = !isLocked && !isOverdue;
  const canDelete     = !!onDelete && !isDeleting;

  // Cek ownership (hanya pemilik yang bisa hapus/edit jika ada currentUserId)
  const isOwner = !currentUserId || String(agenda.createdBy ?? '') === String(currentUserId);

  // Owner dari users list (untuk AgendaPage yang multi-user)
  const owner = users.find(u => String(u.id) === String(agenda.createdBy));

  const fmtDateTime = (val: any) => {
    if (!val) return '-';
    try { return format(new Date(val), "EEEE, d MMMM yyyy - HH:mm", { locale: localeID }); }
    catch { return String(val); }
  };

  const fmtTime = (val: any) => {
    if (!val) return '-';
    try { return format(new Date(val), "HH:mm", { locale: localeID }); }
    catch { return '-'; }
  };

  const durasiLabel = (() => {
    if (!agenda.startTime || !agenda.endTime) return null;
    const mnt = Math.round(
      (new Date(agenda.endTime).getTime() - new Date(agenda.startTime).getTime()) / 60000
    );
    if (mnt <= 0) return null;
    const h = Math.floor(mnt / 60), m = mnt % 60;
    return h > 0 ? `${h} jam${m > 0 ? ` ${m} menit` : ''}` : `${m} menit`;
  })();

  const isPending = completeMutation.isPending || rescheduleNowMutation.isPending || isDeleting;

  // ── Confirm panels ──────────────────────────────────────────────────────────
  const ConfirmPanel = () => {
    if (confirmMode === 'selesai') return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <p className="text-[11px] font-bold text-emerald-600">Tandai agenda ini sebagai selesai?</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setConfirmMode(null)}
            className="flex-1 rounded-xl h-9 text-xs font-bold uppercase">Batal</Button>
          <Button size="sm" onClick={() => completeMutation.mutate()} disabled={isPending}
            className="flex-1 rounded-xl h-9 text-xs font-black uppercase bg-emerald-600 hover:bg-emerald-700 text-white">
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <><CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />Ya, Selesai</>}
          </Button>
        </div>
      </div>
    );

    if (confirmMode === 'pindah') return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20">
          <FastForward className="w-4 h-4 text-amber-500 shrink-0" />
          <p className="text-[11px] font-bold text-amber-600">
            Pindahkan ke waktu sekarang dengan durasi yang sama ({durasiLabel ?? '-'})?
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setConfirmMode(null)}
            className="flex-1 rounded-xl h-9 text-xs font-bold uppercase">Batal</Button>
          <Button size="sm" onClick={() => rescheduleNowMutation.mutate()} disabled={isPending}
            className="flex-1 rounded-xl h-9 text-xs font-black uppercase bg-amber-500 hover:bg-amber-600 text-white">
            {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <><FastForward className="w-3.5 h-3.5 mr-1.5" />Pindahkan</>}
          </Button>
        </div>
      </div>
    );

    if (confirmMode === 'hapus') return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
          <p className="text-[11px] font-bold text-rose-600">Hapus agenda ini secara permanen?</p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setConfirmMode(null)}
            className="flex-1 rounded-xl h-9 text-xs font-bold uppercase">Batal</Button>
          <Button size="sm" onClick={() => { onDelete?.(agenda.id); setConfirmMode(null); }} disabled={isPending}
            className="flex-1 rounded-xl h-9 text-xs font-black uppercase bg-rose-600 hover:bg-rose-700 text-white">
            {isDeleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : <><Trash2 className="w-3.5 h-3.5 mr-1.5" />Ya, Hapus</>}
          </Button>
        </div>
      </div>
    );

    return null;
  };

  return (
    <Dialog open={isVisible} onOpenChange={onClose}>
      <DialogContent className="max-w-md rounded-3xl p-0 overflow-hidden border-border/50">

        {/* Accent bar */}
        <div className={cn("h-1.5 w-full", st.dot)} />

        {/* Header */}
        <div className="px-7 pt-6 pb-4 border-b border-border/40">
          <DialogHeader>
            <div className="flex-1 min-w-0">
              <span className={cn(
                "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-black uppercase border mb-3",
                st.cls
              )}>
                <span className={cn("w-1.5 h-1.5 rounded-full", st.dot)} />
                {st.label}
                {phase === 'future'  && agenda.status === 'Scheduled' && (
                  <span className="ml-1 opacity-60">- Belum dimulai</span>
                )}
                {phase === 'ongoing' && agenda.status === 'Scheduled' && (
                  <span className="ml-1 opacity-60">- Sedang berlangsung</span>
                )}
              </span>
              <DialogTitle className="text-lg font-black text-foreground tracking-tight leading-snug">
                {agenda.title}
              </DialogTitle>
              <DialogDescription className="sr-only">
                Detail agenda berisi status, waktu mulai, waktu selesai, lokasi, catatan, dan aksi yang tersedia.
              </DialogDescription>
              {/* Owner — tampil jika ada users list (AgendaPage multi-user) */}
              {owner && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  oleh <span className="font-bold">{owner.fullName}</span>
                </p>
              )}
            </div>
          </DialogHeader>
        </div>

        {/* Info */}
        <div className="px-7 py-5 space-y-4">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
              <Calendar className="w-4 h-4 text-primary" />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">Mulai</p>
              <p className="text-sm font-semibold text-foreground">{fmtDateTime(agenda.startTime)}</p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-xl bg-muted/60 flex items-center justify-center shrink-0 mt-0.5">
              <Clock className="w-4 h-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">Selesai</p>
              <p className="text-sm font-semibold text-foreground">
                {fmtTime(agenda.endTime)}
                {durasiLabel && (
                  <span className="ml-2 text-[10px] font-bold text-muted-foreground">({durasiLabel})</span>
                )}
              </p>
            </div>
          </div>

          {agenda.location && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-xl bg-muted/60 flex items-center justify-center shrink-0 mt-0.5">
                <MapPin className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">Lokasi</p>
                <p className="text-sm font-semibold text-foreground">{agenda.location}</p>
              </div>
            </div>
          )}

          {agenda.description && (
            <div className="flex gap-3">
              <div className="w-8 h-8 rounded-xl bg-muted/60 flex items-center justify-center shrink-0 mt-0.5">
                <Tag className="w-4 h-4 text-muted-foreground" />
              </div>
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-0.5">Catatan</p>
                <p className="text-sm text-foreground/80 leading-relaxed">{agenda.description}</p>
              </div>
            </div>
          )}

          {/* Info Overdue — dikunci */}
          {isOverdue && (
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-rose-500/10 border border-rose-500/20">
              <Lock className="w-4 h-4 text-rose-400 shrink-0" />
              <p className="text-[11px] font-bold text-rose-400 leading-snug">
                Agenda sudah melewati batas waktu dan tidak dapat diubah. Buat agenda baru jika diperlukan.
              </p>
            </div>
          )}

          {/* Info future */}
          {phase === 'future' && !isLocked && !isOverdue && (
            <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
              <Info className="w-4 h-4 text-blue-400 shrink-0" />
              <p className="text-[11px] font-bold text-blue-400 leading-snug">
                Agenda belum dimulai. Tidak bisa ditandai selesai sebelum waktunya.
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-7 pb-6 pt-2 border-t border-border/40 bg-muted/5">
          {confirmMode ? (
            <div className="pt-3"><ConfirmPanel /></div>
          ) : (
            <div className="space-y-2 pt-3">
              <div className="flex gap-2 flex-wrap">

                {/* Selesai */}
                {canComplete && isOwner && (
                  <Button variant="outline" size="sm"
                    onClick={() => setConfirmMode('selesai')}
                    className="flex-1 rounded-xl h-10 gap-2 font-bold text-xs uppercase border-emerald-500/30 text-emerald-600 hover:bg-emerald-500/10">
                    <CheckCircle2 className="w-3.5 h-3.5" /> Selesai
                  </Button>
                )}

                {/* Mulai Sekarang */}
                {canReschedule && isOwner && (
                  <Button variant="outline" size="sm"
                    onClick={() => setConfirmMode('pindah')}
                    className="flex-1 rounded-xl h-10 gap-2 font-bold text-xs uppercase border-amber-500/30 text-amber-600 hover:bg-amber-500/10">
                    <FastForward className="w-3.5 h-3.5" /> Mulai Sekarang
                  </Button>
                )}

                {/* Edit */}
                {canEdit && isOwner ? (
                  <Button size="sm"
                    onClick={() => { onClose(); onEdit(agenda); }}
                    className="flex-1 rounded-xl h-10 gap-2 font-bold text-xs uppercase">
                    <Edit2 className="w-3.5 h-3.5" /> Edit Agenda
                  </Button>
                ) : (isLocked || isOverdue) ? (
                  <Button size="sm" disabled
                    className="flex-1 rounded-xl h-10 gap-2 font-bold text-xs uppercase opacity-40 cursor-not-allowed">
                    <Lock className="w-3.5 h-3.5" />
                    {isOverdue ? 'Terkunci' : 'Sudah Selesai'}
                  </Button>
                ) : null}
              </div>

              {/* Hapus — baris terpisah, hanya owner */}
              {canDelete && isOwner && (
                <Button variant="ghost" size="sm"
                  onClick={() => setConfirmMode('hapus')}
                  className="w-full rounded-xl h-9 gap-2 font-bold text-xs uppercase text-rose-500 hover:bg-rose-500/10 hover:text-rose-600">
                  <Trash2 className="w-3.5 h-3.5" /> Hapus Agenda
                </Button>
              )}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
