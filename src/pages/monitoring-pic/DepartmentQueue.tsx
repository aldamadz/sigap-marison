import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { toast } from 'react-hot-toast';
import {
  ChevronDown, ChevronRight, FileText, Paperclip, FileCheck,
  Download, MessageSquare, LockOpen, Lock, Clock, CheckCircle2,
  XCircle, ExternalLink, Inbox, Loader2, DollarSign
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { id as localeID } from 'date-fns/locale';
import { picService } from '@/services/pic.service';
import { SuratItem, ReviewAction, ReviewState, Department } from './types';
import { getStatusBadge, StatusIcon, getFileUrl, uploadFile } from './utils';
import { ReviewModal } from './ReviewModal';

interface DepartmentQueueProps {
  dept: Department;
  picId: string;
}

// ── Surat Detail Row ──────────────────────────────────────────────────────

const SuratDetailRow: React.FC<{
  surat: SuratItem;
  picId: string;
  onReview: (surat: SuratItem, action: ReviewAction) => void;
  onToggleChat: (surat: SuratItem) => void;
  toggling: boolean;
}> = ({ surat, picId, onReview, onToggleChat, toggling }) => {
  const [expanded, setExpanded] = useState(false);
  const badge = getStatusBadge(surat);

  // Tentukan aksi yang tersedia berdasarkan status
  const getAvailableActions = () => {
    const r = surat.pic_review_status;
    const actions: { action: ReviewAction; label: string; icon: React.ReactNode; color: string }[] = [];

    if (!r || r === 'PENDING') {
      // Pilihan: SPK atau langsung ke Keuangan
      actions.push({
        action: 'APPROVE_SPK',
        label: 'Terbitkan SPK',
        icon: <FileCheck size={12} />,
        color: 'bg-emerald-600 hover:bg-emerald-700 text-white',
      });
      actions.push({
        action: 'APPROVE_KEUANGAN',
        label: 'Proses Keuangan',
        icon: <DollarSign size={12} />,
        color: 'bg-blue-600 hover:bg-blue-700 text-white',
      });
      actions.push({
        action: 'REJECT',
        label: 'Tolak',
        icon: <XCircle size={12} />,
        color: 'bg-red-500/10 hover:bg-red-500/20 text-red-600 border border-red-500/30',
      });
    } else if (r === 'SPK') {
      // Setelah SPK → proses keuangan
      actions.push({
        action: 'APPROVE_KEUANGAN',
        label: 'Proses Keuangan',
        icon: <DollarSign size={12} />,
        color: 'bg-blue-600 hover:bg-blue-700 text-white',
      });
    } else if (r === 'KEUANGAN') {
      // Keuangan → tandai selesai
      actions.push({
        action: 'APPROVE_DONE',
        label: 'Tandai Selesai',
        icon: <CheckCircle2 size={12} />,
        color: 'bg-emerald-600 hover:bg-emerald-700 text-white',
      });
      actions.push({
        action: 'REJECT',
        label: 'Tolak',
        icon: <XCircle size={12} />,
        color: 'bg-red-500/10 hover:bg-red-500/20 text-red-600 border border-red-500/30',
      });
    }
    // KEUANGAN_DONE, KEUANGAN_REJECTED, SPK = final, tidak ada aksi lagi

    return actions;
  };

  const actions = getAvailableActions();
  const isFinished = ['KEUANGAN_DONE', 'KEUANGAN_REJECTED', 'REJECTED'].includes(surat.pic_review_status ?? '');

  return (
    <div className={`border border-border rounded-xl overflow-hidden transition-all ${isFinished ? 'opacity-70' : ''}`}>
      {/* Row header */}
      <div
        className="flex items-center gap-3 px-4 py-3 bg-card/60 cursor-pointer hover:bg-card/90 transition-all select-none"
        onClick={() => setExpanded(v => !v)}
      >
        <button className="text-muted-foreground/50 shrink-0">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </button>

        {/* Status badge */}
        <div className={`flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 rounded border tracking-tight shrink-0 ${badge.color}`}>
          <StatusIcon surat={surat} />
          {badge.label}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-bold text-foreground truncate">{surat.judul_surat}</p>
          <p className="text-[9px] font-mono text-muted-foreground/60">{surat.no_surat}</p>
        </div>

        {/* Creator */}
        {surat.creator_name && (
          <p className="text-[10px] text-muted-foreground shrink-0 hidden sm:block">
            {surat.creator_name}
          </p>
        )}

        {/* Waktu */}
        <span className="text-[9px] text-muted-foreground/50 font-mono shrink-0">
          {formatDistanceToNow(new Date(surat.updated_at), { addSuffix: true, locale: localeID })}
        </span>

        {/* Chat indicator */}
        {surat.chat_status === 'OPEN' && (
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse shrink-0" />
        )}
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border bg-background/50 px-4 py-4 space-y-4">
          {/* File dokumen */}
          <div className="flex flex-wrap gap-2">
            {surat.file_path && (
              <a href={surat.file_path} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border bg-primary/5 text-primary border-primary/20 hover:bg-primary/10 transition-all">
                <FileText size={12} /> Dokumen
              </a>
            )}
            {surat.lampiran_path && (
              <a href={surat.lampiran_path} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border bg-muted text-muted-foreground border-border hover:bg-accent transition-all">
                <Paperclip size={12} /> Lampiran
              </a>
            )}
            {surat.pic_attachment && (
              <a href={getFileUrl(surat.pic_attachment) ?? '#'} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border bg-emerald-500/5 text-emerald-600 border-emerald-500/20 hover:bg-emerald-500/10 transition-all">
                <FileCheck size={12} /> SPK
              </a>
            )}
            {surat.payment_file_path && (
              <a href={getFileUrl(surat.payment_file_path) ?? '#'} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase border bg-blue-500/5 text-blue-600 border-blue-500/20 hover:bg-blue-500/10 transition-all">
                <Download size={12} /> Bukti Bayar
              </a>
            )}
          </div>

          {/* Catatan PIC */}
          {surat.pic_note && (
            <div className="p-3 bg-muted/50 rounded-xl border border-border">
              <p className="text-[9px] font-black uppercase tracking-wider text-muted-foreground mb-1">Catatan PIC</p>
              <p className="text-[11px] text-foreground leading-relaxed">{surat.pic_note}</p>
            </div>
          )}

          {/* Aksi baris bawah */}
          <div className="flex items-center justify-between gap-3 pt-1">
            {/* Toggle chat */}
            <button
              onClick={() => onToggleChat(surat)}
              disabled={toggling}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black uppercase border transition-all ${
                surat.chat_status === 'OPEN'
                  ? 'bg-amber-500/10 text-amber-600 border-amber-500/30 hover:bg-amber-500/20'
                  : 'bg-emerald-500/10 text-emerald-600 border-emerald-500/30 hover:bg-emerald-500/20'
              } ${toggling ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {toggling
                ? <Loader2 size={12} className="animate-spin" />
                : surat.chat_status === 'OPEN'
                  ? <><Lock size={12} /> Tutup Chat</>
                  : <><LockOpen size={12} /> Buka Chat</>
              }
            </button>

            {/* Review actions */}
            {actions.length > 0 && (
              <div className="flex gap-2">
                {actions.map((a) => (
                  <button
                    key={a.action}
                    onClick={() => onReview(surat, a.action)}
                    className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${a.color}`}
                  >
                    {a.icon} {a.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Department Queue Component ────────────────────────────────────────────

export const DepartmentQueue: React.FC<DepartmentQueueProps> = ({ dept, picId }) => {
  const queryClient = useQueryClient();
  const [collapsed, setCollapsed] = useState(false);
  const [toggling, setToggling] = useState<string | null>(null);
  const [reviewState, setReviewState] = useState<ReviewState>({
    open: false, surat: null, action: null, note: '', file: null, loading: false,
  });

  // ── Fetch antrian dept ini ───────────────────────────────────────────
  const { data: suratList = [], isLoading } = useQuery<SuratItem[]>({
    queryKey: ['pic-queue', dept.id, picId],
    enabled: !!picId,
    queryFn: async () => {
      const financeStatuses = ['KEUANGAN', 'KEUANGAN_DONE', 'KEUANGAN_REJECTED'];
      const isFinanceDept = (() => {
        const code = (dept.code ?? '').toLowerCase();
        const name = dept.name.toLowerCase();
        return code.includes('keu') || name.includes('keuangan') || name.includes('akuntansi');
      })();
      const { data, error } = await supabase
        .from('surat_registrasi')
        .select(`
          id, no_surat, judul_surat, status, pic_review_status,
          pic_attachment, pic_note, chat_status, chat_opened_at,
          updated_at, created_at, pic_id, dept_id, created_by,
          file_path, lampiran_path,
          creator:profiles!surat_registrasi_created_by_fkey(full_name),
          finance_reviews(payment_file_path, status)
        `)
        .eq('status', 'DONE')
        .eq('dept_id', dept.id)
        .eq('pic_id', picId)
        .order('updated_at', { ascending: false });

      if (error) throw error;

      const mergedRows = [...(data ?? [])];
      if (isFinanceDept) {
        const { data: financeRows, error: financeError } = await supabase
          .from('surat_registrasi')
          .select(`
            id, no_surat, judul_surat, status, pic_review_status,
            pic_attachment, pic_note, chat_status, chat_opened_at,
            updated_at, created_at, pic_id, dept_id, created_by,
            file_path, lampiran_path,
            creator:profiles!surat_registrasi_created_by_fkey(full_name),
            finance_reviews(payment_file_path, status)
          `)
          .eq('status', 'DONE')
          .in('pic_review_status', financeStatuses)
          .order('updated_at', { ascending: false });

        if (financeError) throw financeError;

        const existingIds = new Set(mergedRows.map((row: any) => row.id));
        (financeRows ?? []).forEach((row: any) => {
          if (!existingIds.has(row.id)) mergedRows.push(row);
        });
      }

      return mergedRows.map((s: any) => ({
        ...s,
        creator_name: s.creator?.full_name ?? null,
        pic_name: null,
        dept_name: dept.name,
        dept_code: dept.code,
        payment_file_path: s.finance_reviews?.[0]?.payment_file_path ?? null,
      }));
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['pic-queue', dept.id, picId] });

  // ── Toggle chat ──────────────────────────────────────────────────────
  const handleToggleChat = async (surat: SuratItem) => {
    setToggling(surat.id);
    try {
      const newStatus = surat.chat_status === 'OPEN' ? 'CLOSED' : 'OPEN';
      if (newStatus === 'OPEN') {
        await picService.openChat(surat.id);
      } else {
        await picService.closeChat(surat.id);
      }
      invalidate();
      toast.success(newStatus === 'OPEN' ? 'Chat dibuka' : 'Chat ditutup');
    } catch {
      toast.error('Gagal mengubah status chat');
    } finally {
      setToggling(null);
    }
  };

  // ── Submit review ────────────────────────────────────────────────────
  const handleSubmitReview = async () => {
    const { surat, action, note, file } = reviewState;
    if (!surat || !action) return;
    setReviewState(s => ({ ...s, loading: true }));

    try {
      let filePath: string | null = null;

      if (action === 'APPROVE_SPK') {
        if (!file) throw new Error('File SPK wajib');
        filePath = await uploadFile(file, 'spk_files', 'spk_files', surat.id);
        await supabase.from('surat_registrasi').update({
          pic_review_status: 'SPK',
          pic_attachment: filePath,
          pic_note: note || null,
          pic_action_at: new Date().toISOString(),
          pic_action_by: picId,
        }).eq('id', surat.id);
        await picService.sendSystemMessage(surat.id, '📋 PIC telah menerbitkan SPK untuk pengajuan ini.');

      } else if (action === 'APPROVE_KEUANGAN') {
        if (!file) throw new Error('File keuangan wajib');
        filePath = await uploadFile(file, 'spk_files', 'payment_files', surat.id);
        // Insert atau update finance_reviews
        const { data: existing } = await supabase
          .from('finance_reviews')
          .select('id')
          .eq('surat_id', surat.id)
          .single();
        if (existing) {
          await supabase.from('finance_reviews').update({
            payment_file_path: filePath,
            status: 'DONE',
            action_at: new Date().toISOString(),
            action_by: picId,
          }).eq('id', existing.id);
        } else {
          await supabase.from('finance_reviews').insert({
            surat_id: surat.id,
            payment_file_path: filePath,
            status: 'DONE',
            assigned_by: picId,
            action_at: new Date().toISOString(),
            action_by: picId,
          });
        }
        await supabase.from('surat_registrasi').update({
          pic_review_status: 'KEUANGAN_DONE',
          pic_note: note || null,
          pic_action_at: new Date().toISOString(),
        }).eq('id', surat.id);
        await picService.sendSystemMessage(surat.id, '💰 PIC telah mengunggah bukti pembayaran. Proses keuangan selesai.');

      } else if (action === 'APPROVE_DONE') {
        await supabase.from('surat_registrasi').update({
          pic_review_status: 'KEUANGAN_DONE',
          pic_note: note || null,
          pic_action_at: new Date().toISOString(),
        }).eq('id', surat.id);
        await picService.sendSystemMessage(surat.id, '✅ PIC menandai pengajuan ini sebagai selesai.');

      } else if (action === 'REJECT') {
        await supabase.from('surat_registrasi').update({
          pic_review_status: 'REJECTED',
          pic_note: note,
          pic_action_at: new Date().toISOString(),
          pic_action_by: picId,
          chat_status: 'CLOSED',
        }).eq('id', surat.id);
        await picService.sendSystemMessage(surat.id, `❌ Pengajuan ditolak PIC.\nAlasan: ${note}`);
      }

      toast.success('Berhasil diproses');
      setReviewState({ open: false, surat: null, action: null, note: '', file: null, loading: false });
      invalidate();

    } catch (err: any) {
      toast.error(err.message ?? 'Gagal memproses');
      setReviewState(s => ({ ...s, loading: false }));
    }
  };

  // ── Stats ────────────────────────────────────────────────────────────
  const pending = suratList.filter(s => !s.pic_review_status || s.pic_review_status === 'PENDING').length;
  const inProgress = suratList.filter(s => ['SPK', 'KEUANGAN'].includes(s.pic_review_status ?? '')).length;
  const done = suratList.filter(s => ['KEUANGAN_DONE', 'KEUANGAN_REJECTED', 'REJECTED'].includes(s.pic_review_status ?? '')).length;

  return (
    <>
      <ReviewModal
        state={reviewState}
        onClose={() => setReviewState({ open: false, surat: null, action: null, note: '', file: null, loading: false })}
        onSubmit={handleSubmitReview}
        onChange={(patch) => setReviewState(s => ({ ...s, ...patch }))}
      />

      <div className="bg-card border border-border rounded-2xl overflow-hidden">
        {/* Dept header */}
        <button
          onClick={() => setCollapsed(v => !v)}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-secondary/30 transition-all text-left"
        >
          <div className="flex items-center gap-3">
            {/* Dept badge */}
            {dept.code && (
              <span className="text-[9px] font-black uppercase tracking-widest px-2 py-1 bg-primary/10 text-primary rounded-lg border border-primary/20">
                {dept.code}
              </span>
            )}
            <div>
              <p className="text-sm font-black uppercase tracking-tight text-foreground">{dept.name}</p>
              <p className="text-[9px] text-muted-foreground mt-0.5">
                {suratList.length} pengajuan
                {pending > 0 && <span className="text-amber-600 font-bold"> · {pending} menunggu</span>}
                {inProgress > 0 && <span className="text-blue-600 font-bold"> · {inProgress} diproses</span>}
                {done > 0 && <span className="text-muted-foreground"> · {done} selesai</span>}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Counter badges */}
            {pending > 0 && (
              <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[9px] font-black flex items-center justify-center">
                {pending}
              </span>
            )}
            {collapsed ? <ChevronRight size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
          </div>
        </button>

        {/* List */}
        {!collapsed && (
          <div className="border-t border-border px-4 py-4 space-y-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground">
                <Loader2 size={16} className="animate-spin" />
                <span className="text-[11px] font-bold">Memuat antrian...</span>
              </div>
            ) : suratList.length === 0 ? (
              <div className="flex flex-col items-center py-8 gap-2 opacity-30">
                <Inbox size={28} strokeWidth={1} />
                <p className="text-[10px] font-bold uppercase tracking-widest">Tidak ada antrian</p>
              </div>
            ) : (
              suratList.map(surat => (
                <SuratDetailRow
                  key={surat.id}
                  surat={surat}
                  picId={picId}
                  onReview={(s, a) => setReviewState({ open: true, surat: s, action: a, note: '', file: null, loading: false })}
                  onToggleChat={handleToggleChat}
                  toggling={toggling === surat.id}
                />
              ))
            )}
          </div>
        )}
      </div>
    </>
  );
};
