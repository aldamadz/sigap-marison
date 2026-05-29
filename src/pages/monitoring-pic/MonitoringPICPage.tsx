import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { picService, ChatMessage } from '@/services/pic.service';
import { documentPreviewService } from '@/services/document-preview.service';
import { appStorageService } from '@/services/storage.service';
import {
  Send, Paperclip, X, Lock, LockOpen, MessageSquare,
  FileText, FileCheck, ExternalLink, Loader2,
  CheckCircle2, Clock, XCircle, Inbox, Search,
  Download, ShieldCheck, CreditCard, AlertTriangle,
  Upload, User, RefreshCw, Receipt, Banknote
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { formatDistanceToNow } from 'date-fns';
import { id as localeID } from 'date-fns/locale';
import { useNotifSound } from '@/hooks/useNotifSound';

// ── Types ─────────────────────────────────────────────────────────────────

interface SuratItem {
  id: string;
  no_surat: string;
  judul_surat: string;
  status: string;
  pic_id: string | null;
  pic_review_status: string | null;
  pic_attachment: string | null;
  pic_note: string | null;
  chat_status: 'OPEN' | 'CLOSED';
  updated_at: string;
  created_by: string;
  file_path: string | null;
  lampiran_path: string | null;
  surat_attachments?: Array<{
    id: string;
    file_url: string;
    file_name: string | null;
    file_type?: string | null;
    file_size?: number | null;
  }>;
  creator_name: string | null;
  form_dept_id: string;
  form_dept_name: string;
  unread_count?: number;
  finance_review_id?: string | null;
  // ✅ FIX 1: tambah payment_file_path
  payment_file_path?: string | null;
}

interface Department {
  id: string;
  name: string;
  code: string | null;
}

type FinalAction = 'SEND_SPK' | 'TO_FINANCE' | 'REJECT' | 'FINANCE_DONE' | 'FINANCE_REJECT';

// ── Helpers ───────────────────────────────────────────────────────────────

const getStatusBadge = (surat: SuratItem) => {
  const r = surat.pic_review_status;
  if (r === 'SPK')               return { label: 'SPK Diterbitkan',    color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
  if (r === 'KEUANGAN')          return { label: 'Dialihkan Keuangan', color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' };
  if (r === 'KEUANGAN_DONE')     return { label: 'Keuangan Selesai',   color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20' };
  if (r === 'KEUANGAN_REJECTED') return { label: 'Ditolak Keuangan',   color: 'text-red-400 bg-red-500/10 border-red-500/20' };
  if (r === 'REJECTED')          return { label: 'Ditolak',            color: 'text-red-400 bg-red-500/10 border-red-500/20' };
  if (r === 'PENDING')           return { label: 'Menunggu Review',    color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' };
  return { label: 'Baru Masuk',                                        color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' };
};

const buildSyntheticMessage = (surat: SuratItem): ChatMessage => ({
  id: `system-${surat.id}`,
  surat_id: surat.id,
  sender_id: 'system',
  sender_name: 'SYSTEM',
  sender_role: 'system',
  message:
    surat.pic_review_status === 'KEUANGAN'
      ? 'Pengajuan ini sedang berada di antrian tim keuangan.'
      : surat.pic_review_status === 'KEUANGAN_DONE'
        ? 'Proses keuangan sudah selesai.'
        : surat.pic_review_status === 'KEUANGAN_REJECTED'
          ? 'Pengajuan ini ditolak oleh tim keuangan.'
          : 'Belum ada percakapan pada pengajuan ini.',
  attachment_url: null,
  is_system: true,
  is_read: true,
  created_at: surat.updated_at,
});

// ── Action Modal ──────────────────────────────────────────────────────────

interface ActionModalProps {
  action: FinalAction;
  suratId: string;
  hasSPK: boolean;
  onConfirm: (note: string, file?: File) => void;
  onCancel: () => void;
  isLoading: boolean;
  errorMessage?: string | null;
}

const ACTION_META: Record<FinalAction, {
  title: string; desc: string; needsFile: boolean;
  needsNote: boolean; btnClass: string; uploadLabel?: string;
}> = {
  SEND_SPK:       { title: 'Kirim SPK',             desc: 'Upload file SPK lalu kirim ke pemohon.',          needsFile: true,  needsNote: false, btnClass: 'bg-emerald-600 hover:bg-emerald-700', uploadLabel: 'Klik untuk upload file SPK' },
  TO_FINANCE:     { title: 'Alihkan ke Keuangan',   desc: 'Teruskan ke Tim Keuangan untuk diproses.',        needsFile: false, needsNote: false, btnClass: 'bg-blue-600 hover:bg-blue-700' },
  REJECT:         { title: 'Tolak Pengajuan',       desc: 'Tolak dokumen ini. Pembuat akan diberi tahu.',    needsFile: false, needsNote: true,  btnClass: 'bg-red-600 hover:bg-red-700' },
  FINANCE_DONE:   { title: 'Kirim Bukti Transaksi', desc: 'Upload bukti pembayaran. Proses Keuangan selesai.',needsFile: true,  needsNote: false, btnClass: 'bg-emerald-600 hover:bg-emerald-700', uploadLabel: 'Klik untuk upload bukti transaksi' },
  FINANCE_REJECT: { title: 'Tolak (Keuangan)',      desc: 'Tolak dari sisi Keuangan. Wajib isi alasan.',     needsFile: false, needsNote: true,  btnClass: 'bg-red-600 hover:bg-red-700' },
};

const getActionErrorMessage = (err: any) => {
  const raw = err?.message || err?.details || err?.hint || err?.error_description || 'Aksi gagal';
  if (String(raw).includes('Anda bukan PIC Departemen Keuangan')) {
    return 'Akses ditolak. Akun ini belum terdaftar sebagai PIC Departemen Keuangan.';
  }
  if (String(raw).includes('Anda bukan PIC departemen surat ini')) {
    return 'Akses ditolak. Akun ini belum terdaftar sebagai PIC departemen surat ini.';
  }
  return String(raw);
};

const ActionModal: React.FC<ActionModalProps> = ({ action, hasSPK, onConfirm, onCancel, isLoading, errorMessage }) => {
  const [note, setNote] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const meta = ACTION_META[action];

  const canSubmit = !isLoading &&
    (!meta.needsFile || !!file || (action === 'SEND_SPK' && hasSPK)) &&
    (!meta.needsNote || note.trim().length > 3);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div className="bg-[#0f1117] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-5 border-b border-white/10">
          <p className="text-sm font-black uppercase tracking-widest text-white">{meta.title}</p>
          <p className="text-[11px] text-white/40 mt-1">{meta.desc}</p>
        </div>
        <div className="p-5 space-y-4">
          {errorMessage && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-[11px] font-bold leading-relaxed text-red-200">
              <div className="mb-1 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-red-300">
                <AlertTriangle size={14} /> Akses Ditolak
              </div>
              {errorMessage}
            </div>
          )}
          {meta.needsFile && (
            <>
              <input ref={fileRef} type="file" className="hidden"
                accept=".pdf,.xlsx,.xls,.doc,.docx,.png,.jpg"
                onChange={e => setFile(e.target.files?.[0] ?? null)} />
              <button onClick={() => fileRef.current?.click()}
                className="w-full border-2 border-dashed border-white/10 rounded-xl p-4 flex flex-col items-center gap-2 hover:border-primary/40 transition-all">
                {file
                  ? <><Paperclip size={18} className="text-primary" /><p className="text-[11px] font-bold text-primary">{file.name}</p></>
                  : <><Upload size={18} className="text-white/30" /><p className="text-[11px] text-white/40">{meta.uploadLabel ?? 'Klik untuk upload file'}</p></>
                }
              </button>
              {action === 'SEND_SPK' && hasSPK && !file && (
                <p className="text-[10px] text-emerald-400 text-center">✓ SPK sebelumnya akan digunakan jika tidak upload baru</p>
              )}
            </>
          )}
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-white/40 block mb-1.5">
              Catatan {meta.needsNote ? <span className="text-red-400">*</span> : '(Opsional)'}
            </label>
            <textarea rows={3} value={note} onChange={e => setNote(e.target.value)}
              placeholder={meta.needsNote ? 'Tuliskan alasan penolakan...' : 'Tambahkan catatan...'}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white resize-none outline-none focus:ring-2 focus:ring-primary/30 placeholder:text-white/20" />
          </div>
        </div>
        <div className="flex gap-2 p-5 pt-0">
          <button onClick={onCancel} disabled={isLoading}
            className="flex-1 py-2.5 rounded-xl border border-white/10 text-[11px] font-black uppercase text-white/60 hover:bg-white/5 transition-all">
            Batal
          </button>
          <button onClick={() => onConfirm(note, file ?? undefined)} disabled={!canSubmit}
            className={`flex-1 py-2.5 rounded-xl text-white text-[11px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2 ${meta.btnClass} disabled:opacity-40`}>
            {isLoading ? <Loader2 size={14} className="animate-spin" /> : meta.title}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Chat Panel ────────────────────────────────────────────────────────────

interface ChatPanelProps {
  surat: SuratItem;
  currentUser: { id: string; full_name: string };
  isFinanceUser: boolean;
  onActionComplete: () => void;
}

const ChatPanel: React.FC<ChatPanelProps> = ({ surat: initialSurat, currentUser, isFinanceUser, onActionComplete }) => {
  const queryClient = useQueryClient();
  const playNotif = useNotifSound();
  // Ref agar playNotif bisa dipanggil dari dalam useEffect tanpa stale closure
  const playNotifRef = useRef(playNotif);
  useEffect(() => { playNotifRef.current = playNotif; }, [playNotif]);
  const [suratData, setSuratData] = useState(initialSurat);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isTogglingChat, setIsTogglingChat] = useState(false);
  const [uploadingSPK, setUploadingSPK] = useState(false);
  const [isOpeningPdf, setIsOpeningPdf] = useState(false);
  const [activeAction, setActiveAction] = useState<FinalAction | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isActing, setIsActing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isChatOpen = suratData.chat_status === 'OPEN';
  const isFinalised = ['SPK', 'KEUANGAN_DONE', 'KEUANGAN_REJECTED', 'REJECTED'].includes(suratData.pic_review_status ?? '');
  const isKeuanganPending = suratData.pic_review_status === 'KEUANGAN';
  const showPICActions = !isFinalised && !isKeuanganPending;
  // ✅ FIX 2: Finance user bisa aksi jika KEUANGAN (pending) saja — KEUANGAN_DONE sudah final
  const showFinanceActions = isFinanceUser && isKeuanganPending;
  const canSend = isChatOpen && !isSending;
  const openStoredFile = (path: string) => {
    documentPreviewService.openStoredFileInNewTab(suratData.id, path)
      .catch((error: any) => toast.error(error.message || 'Gagal membuka file.'));
  };
  const openGeneratedPdf = async () => {
    setIsOpeningPdf(true);
    try {
      const pdfUrl = await documentPreviewService.getPdfUrl(suratData.id);
      await documentPreviewService.openStoredFileInNewTab(suratData.id, pdfUrl);
    } catch (error: any) {
      toast.error(error.message || 'Gagal membuka PDF dokumen.');
    } finally {
      setIsOpeningPdf(false);
    }
  };

  useEffect(() => { setSuratData(initialSurat); }, [initialSurat]);

  useEffect(() => {
    if (!suratData?.id) return;
    picService.getChatHistory(suratData.id)
      .then((rows) => {
        setMessages(rows.length > 0 ? rows : [buildSyntheticMessage(suratData)]);
      })
      .catch((error) => {
        console.error('Failed to load chat history', error);
        setMessages([buildSyntheticMessage(suratData)]);
      });
    picService.markCreatorChatsRead(suratData.id).catch((error) => {
      console.error('Failed to mark creator chats as read on chat open', error);
    });
  }, [suratData.id]);

  useEffect(() => {
    if (!suratData?.id) return;
    const ch = picService.subscribeChat(suratData.id, (msg) => {
      setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
      if (msg.sender_role === 'creator' && !msg.is_system) {
        playNotifRef.current();
        picService.markCreatorChatsRead(suratData.id).catch((error) => {
          console.error('Failed to mark creator chats as read on incoming message', error);
        });
      }
    });
    return () => { supabase.removeChannel(ch); };
  }, [suratData.id]);

  useEffect(() => {
    if (!suratData?.id) return;
    const ch = picService.subscribeSuratStatus(suratData.id, (updated) => {
      setSuratData(prev => ({ ...prev, ...updated }));
      queryClient.invalidateQueries({ queryKey: ['pic-chat-list'] });
    });
    return () => { supabase.removeChannel(ch); };
  }, [suratData.id, queryClient]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleToggleChat = async () => {
    setIsTogglingChat(true);
    try {
      if (isChatOpen) {
        await picService.closeChat(suratData.id);
        toast.success('Chat ditutup');
      } else {
        await picService.openChat(suratData.id);
        toast.success('Chat dibuka');
      }
      setSuratData(prev => ({ ...prev, chat_status: isChatOpen ? 'CLOSED' : 'OPEN' }));
      queryClient.invalidateQueries({ queryKey: ['pic-chat-list'] });
    } catch (err: any) {
      toast.error(err.message || 'Gagal mengubah status chat');
    } finally {
      setIsTogglingChat(false);
    }
  };

  const handleSPKUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingSPK(true);
    const toastId = toast.loading('Mengunggah SPK...');
    try {
      const fileName = `spk-${suratData.id}-${Date.now()}.${file.name.split('.').pop()}`;
      const filePath = `spk_files/${fileName}`;
      const uploaded = await appStorageService.upload({ bucket: 'spk_files', path: filePath, file });
      await picService.uploadSPK(suratData.id, uploaded.publicUrl);
      setSuratData(prev => ({ ...prev, pic_attachment: uploaded.publicUrl }));
      queryClient.invalidateQueries({ queryKey: ['pic-chat-list'] });
      toast.success('SPK berhasil diunggah', { id: toastId });
    } catch (err: any) {
      toast.error('Gagal mengunggah', { id: toastId });
    } finally {
      setUploadingSPK(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() && !attachment) return;
    if (!isChatOpen) return toast.error('Chat sudah ditutup');
    setIsSending(true);
    try {
      let fileUrl: string | null = null;
      if (attachment) {
        const path = `chat_attachments/${Date.now()}-${attachment.name}`;
        const uploaded = await appStorageService.upload({ bucket: 'chat_attachments', path, file: attachment });
        fileUrl = uploaded.publicUrl;
      }
      await picService.sendMessage(suratData.id, newMessage, fileUrl, 'pic');
      setNewMessage('');
      setAttachment(null);
    } catch {
      toast.error('Gagal mengirim pesan');
    } finally {
      setIsSending(false);
    }
  };

  const handleConfirmAction = async (note: string, file?: File) => {
    if (!activeAction) return;
    setIsActing(true);
    setActionError(null);
    try {
      if (activeAction === 'SEND_SPK') {
        if (file) {
          const fileName = `spk-${suratData.id}-${Date.now()}.${file.name.split('.').pop()}`;
          const filePath = `spk_files/${fileName}`;
          const uploaded = await appStorageService.upload({ bucket: 'spk_files', path: filePath, file });
          await picService.uploadSPK(suratData.id, uploaded.publicUrl);
          setSuratData(prev => ({ ...prev, pic_attachment: uploaded.publicUrl }));
        }
        if (!suratData.pic_attachment && !file) {
          toast.error('File SPK belum diunggah!');
          setIsActing(false);
          return;
        }
        await picService.takeAction(suratData.id, 'SEND_SPK', note);
        toast.success('✅ SPK berhasil dikirim');

      } else if (activeAction === 'TO_FINANCE') {
        await picService.takeAction(suratData.id, 'TO_FINANCE', note);
        toast.success('💰 Dialihkan ke Keuangan');

      } else if (activeAction === 'REJECT') {
        await picService.takeAction(suratData.id, 'REJECT', note);
        toast.success('❌ Pengajuan ditolak');

      } else if (activeAction === 'FINANCE_DONE') {
        const reviewId = suratData.finance_review_id;
        if (!reviewId) throw new Error('Finance review ID tidak ditemukan');
        let filePath: string | null = null;
        if (file) {
          const fileName = `payment-${suratData.id}-${Date.now()}.${file.name.split('.').pop()}`;
          const uploaded = await appStorageService.upload({ bucket: 'payment_files', path: fileName, file });
          filePath = uploaded.publicUrl;
        }
        const { error } = await supabase.rpc('finance_take_action', {
          p_review_id: reviewId,
          p_action: 'DONE',
          p_note: note,
          p_file_path: filePath,
        });
        if (error) throw error;
        // ✅ Update local state agar bukti bayar langsung tampil tanpa refresh
        if (filePath) setSuratData(prev => ({ ...prev, payment_file_path: filePath }));
        toast.success('✅ Bukti transaksi dikirim');

      } else if (activeAction === 'FINANCE_REJECT') {
        const reviewId = suratData.finance_review_id;
        if (!reviewId) throw new Error('Finance review ID tidak ditemukan');
        const { error } = await supabase.rpc('finance_take_action', {
          p_review_id: reviewId,
          p_action: 'REJECTED',
          p_note: note,
        });
        if (error) throw error;
        toast.success('❌ Pengajuan ditolak oleh Keuangan');
      }

      const newStatus =
        activeAction === 'SEND_SPK'       ? 'SPK' :
        activeAction === 'TO_FINANCE'     ? 'KEUANGAN' :
        activeAction === 'REJECT'         ? 'REJECTED' :
        activeAction === 'FINANCE_DONE'   ? 'KEUANGAN_DONE' :
        activeAction === 'FINANCE_REJECT' ? 'KEUANGAN_REJECTED' : null;

      setSuratData(prev => ({
        ...prev,
        pic_review_status: newStatus ?? prev.pic_review_status,
        chat_status: 'CLOSED',
      }));
      setActiveAction(null);
      setActionError(null);
      queryClient.invalidateQueries({ queryKey: ['pic-chat-list'] });
      onActionComplete();
    } catch (err: any) {
      const message = getActionErrorMessage(err);
      setActionError(message);
      toast.error(message);
    } finally {
      setIsActing(false);
    }
  };

  // ✅ FIX 3: Apakah ada bukti bayar (dari state lokal atau prop awal)
  const attachments = suratData.surat_attachments?.length
    ? suratData.surat_attachments
    : suratData.lampiran_path
      ? [{ id: 'legacy-lampiran', file_url: suratData.lampiran_path, file_name: 'Lampiran' }]
      : [];

  return (
    <div className="flex flex-col h-full bg-[#080a0f] relative">

      {activeAction && (
        <ActionModal
          action={activeAction}
          suratId={suratData.id}
          hasSPK={!!suratData.pic_attachment}
          onConfirm={handleConfirmAction}
          onCancel={() => { setActiveAction(null); setActionError(null); }}
          isLoading={isActing}
          errorMessage={actionError}
        />
      )}

      {/* ── HEADER ── */}
      <div className="px-6 py-4 border-b border-white/5 bg-[#0d0f16] shrink-0">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="flex items-center gap-1 text-[9px] font-black uppercase px-2 py-0.5 bg-primary/20 text-primary rounded">
                <User size={9} /> {suratData.creator_name || 'Pemohon'}
              </span>
              <span className="text-[9px] font-mono text-white/30">{suratData.no_surat}</span>
            </div>
            <h2 className="text-sm font-extrabold text-white uppercase tracking-tight truncate">
              {suratData.judul_surat}
            </h2>
          </div>
          <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[9px] font-black uppercase shrink-0 ${
            isChatOpen
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-white/5 text-white/30 border-white/10'
          }`}>
            {isChatOpen
              ? <><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live</>
              : <><Lock size={10} /> Tertutup</>
            }
          </div>
        </div>

        {/* ✅ FIX 4: Tombol file — termasuk SPK dan Bukti Bayar selalu tampil jika ada */}
        <div className="flex flex-wrap gap-1.5 mb-3">
          {suratData.file_path && (
            <button type="button" onClick={openGeneratedPdf} disabled={isOpeningPdf}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase border bg-primary/5 text-primary border-primary/20 hover:bg-primary/10 transition-all disabled:opacity-60">
              {isOpeningPdf ? <Loader2 size={10} className="animate-spin" /> : <FileText size={10} />} Dokumen
            </button>
          )}
          {attachments.map((attachment, index) => (
            <button type="button" key={attachment.id ?? attachment.file_url} onClick={() => openStoredFile(attachment.file_url)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase border bg-white/5 text-white/50 border-white/10 hover:bg-white/10 transition-all">
              <Paperclip size={10} /> Lampiran {index + 1}
            </button>
          ))}
          {/* SPK — tampil di semua status jika ada */}
          {suratData.pic_attachment && (
            <button type="button" onClick={() => openStoredFile(suratData.pic_attachment!)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase border bg-emerald-500/5 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/10 transition-all">
              <FileCheck size={10} /> SPK
            </button>
          )}
          {/* ✅ FIX 5: Bukti Bayar — tampil di semua status termasuk KEUANGAN_DONE */}
          {suratData.payment_file_path && (
            <button type="button" onClick={() => openStoredFile(suratData.payment_file_path!)}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase border bg-blue-500/5 text-blue-400 border-blue-500/20 hover:bg-blue-500/10 transition-all">
              <Download size={10} /> Bukti Bayar
            </button>
          )}
        </div>

        {/* Panel Aksi PIC */}
        {showPICActions && (
          <div className="space-y-2">
            <div className="flex items-center justify-between p-2.5 bg-white/5 rounded-xl border border-white/10">
              <div className="flex items-center gap-2">
                {suratData.pic_attachment
                  ? <><CheckCircle2 size={13} className="text-emerald-400" /><span className="text-[10px] font-bold text-emerald-400">SPK sudah diunggah</span></>
                  : <><AlertTriangle size={13} className="text-amber-400" /><span className="text-[10px] font-bold text-white/40">Unggah SPK sebelum finalisasi</span></>
                }
              </div>
              <label className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[9px] font-black uppercase cursor-pointer transition-all border ${
                uploadingSPK
                  ? 'opacity-50 pointer-events-none bg-white/5 border-white/10 text-white/30'
                  : 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20'
              }`}>
                {uploadingSPK ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} />}
                {suratData.pic_attachment ? 'Ganti' : 'Upload SPK'}
                <input type="file" className="hidden" onChange={handleSPKUpload} disabled={uploadingSPK} />
              </label>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              <button onClick={() => setActiveAction('SEND_SPK')}
                className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all text-[9px] font-black uppercase">
                <ShieldCheck size={14} /> Kirim SPK
              </button>
              <button onClick={() => setActiveAction('TO_FINANCE')}
                className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border border-blue-500/20 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-all text-[9px] font-black uppercase">
                <CreditCard size={14} /> Keuangan
              </button>
              <button onClick={() => setActiveAction('REJECT')}
                className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all text-[9px] font-black uppercase">
                <XCircle size={14} /> Tolak
              </button>
            </div>
            <button onClick={handleToggleChat} disabled={isTogglingChat}
              className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${
                isChatOpen
                  ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
              }`}>
              {isTogglingChat
                ? <Loader2 size={11} className="animate-spin" />
                : isChatOpen
                  ? <><Lock size={11} /> Tutup Sesi Chat</>
                  : <><LockOpen size={11} /> Buka Sesi Chat</>
              }
            </button>
          </div>
        )}

        {/* Panel Aksi Keuangan */}
        {showFinanceActions && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 rounded-xl border border-blue-500/20 text-[10px] font-black uppercase text-blue-400">
              <Banknote size={11} /> Antrian Tim Keuangan
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button onClick={() => setActiveAction('FINANCE_DONE')}
                className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-all text-[9px] font-black uppercase">
                <Receipt size={14} /> Bukti Transaksi
              </button>
              <button onClick={() => setActiveAction('FINANCE_REJECT')}
                className="flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all text-[9px] font-black uppercase">
                <XCircle size={14} /> Tolak
              </button>
            </div>
            <button onClick={handleToggleChat} disabled={isTogglingChat}
              className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${
                isChatOpen
                  ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
              }`}>
              {isTogglingChat
                ? <Loader2 size={11} className="animate-spin" />
                : isChatOpen
                  ? <><Lock size={11} /> Tutup Sesi Chat</>
                  : <><LockOpen size={11} /> Buka Sesi Chat</>
              }
            </button>
          </div>
        )}

        {/* Menunggu Keuangan (non-finance user) */}
        {isKeuanganPending && !isFinanceUser && (
          <div className="flex items-center gap-2 px-3 py-2 bg-blue-500/10 rounded-xl border border-blue-500/20 text-[10px] font-black uppercase text-blue-400">
            <Clock size={11} /> Menunggu diproses Tim Keuangan
          </div>
        )}

        {/* ✅ FIX 6: Status final — tampilkan info selesai + tombol toggle chat */}
        {isFinalised && (
          <div className="space-y-2">
            <div className="flex items-center gap-2 px-3 py-2 bg-white/5 rounded-xl border border-white/10 text-[10px] font-black uppercase text-white/30">
              <CheckCircle2 size={11} className="text-emerald-400" /> Dokumen sudah mendapat keputusan akhir
            </div>
            {/* Toggle chat tetap tersedia meski sudah final */}
            <button onClick={handleToggleChat} disabled={isTogglingChat}
              className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl border text-[9px] font-black uppercase tracking-widest transition-all ${
                isChatOpen
                  ? 'bg-red-500/10 text-red-400 border-red-500/20 hover:bg-red-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
              }`}>
              {isTogglingChat
                ? <Loader2 size={11} className="animate-spin" />
                : isChatOpen
                  ? <><Lock size={11} /> Tutup Sesi Chat</>
                  : <><LockOpen size={11} /> Buka Sesi Chat</>
              }
            </button>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className={`px-4 py-1.5 text-[9px] font-black uppercase tracking-widest flex items-center gap-2 border-b shrink-0 ${
        isChatOpen
          ? 'bg-emerald-500/5 text-emerald-400 border-emerald-500/10'
          : 'bg-white/2 text-white/20 border-white/5'
      }`}>
        {isChatOpen ? <><LockOpen size={10} /> Sesi diskusi aktif</> : <><Lock size={10} /> Chat tertutup</>}
      </div>

      {/* ── AREA CHAT ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-5 py-4 space-y-3 scroll-smooth">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full opacity-10 gap-3">
            <MessageSquare size={40} strokeWidth={1} className="text-white" />
            <p className="text-[10px] font-black uppercase tracking-widest text-white">Belum Ada Diskusi</p>
          </div>
        )}
        {messages.map(msg => {
          const isMe = msg.sender_id === currentUser.id && msg.sender_role === 'pic';
          if (msg.is_system) {
            return (
              <div key={msg.id} className="flex justify-center">
                <div className="bg-white/5 border border-white/10 rounded-full px-4 py-1">
                  <p className="text-[9px] text-white/30 text-center">{msg.message}</p>
                </div>
              </div>
            );
          }
          return (
            <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <div className="flex items-center gap-2 mb-1 px-1">
                  <span className={`text-[9px] font-black uppercase ${isMe ? 'text-primary' : 'text-white/40'}`}>
                    {isMe ? 'Anda (PIC)' : (msg.sender_name ?? 'Pemohon')}
                  </span>
                  <span className="text-[8px] text-white/20 font-mono">
                    {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className={`px-4 py-2.5 rounded-2xl text-[12px] leading-relaxed font-medium whitespace-pre-wrap ${
                  isMe
                    ? 'bg-primary text-white rounded-tr-sm'
                    : 'bg-white/8 border border-white/10 text-white rounded-tl-sm'
                }`}>
                  {msg.attachment_url && (
                    <button type="button" onClick={() => openStoredFile(msg.attachment_url!)}
                      className={`flex items-center gap-2 mb-2 p-2 rounded-lg border text-[9px] font-bold uppercase ${
                        isMe ? 'bg-black/20 border-white/10' : 'bg-white/5 border-white/10'
                      }`}>
                      <Paperclip size={10} /> Lampiran <ExternalLink size={9} className="ml-auto" />
                    </button>
                  )}
                  {msg.message}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* ── INPUT ── */}
      <div className="px-5 py-4 border-t border-white/5 bg-[#0d0f16] shrink-0">
        {attachment && (
          <div className="flex items-center justify-between mb-2.5 bg-primary/10 border border-primary/20 px-3 py-2 rounded-lg">
            <span className="text-[10px] font-bold text-primary flex items-center gap-1.5 truncate">
              <Paperclip size={11} /> {attachment.name}
            </span>
            <button onClick={() => setAttachment(null)} className="text-white/30 hover:text-red-400 ml-2 shrink-0">
              <X size={13} />
            </button>
          </div>
        )}
        <form onSubmit={handleSend} className="flex gap-2">
          <label className={`p-2.5 rounded-xl border flex items-center justify-center shrink-0 transition-all ${
            !canSend
              ? 'bg-white/5 border-white/5 opacity-30 cursor-not-allowed'
              : 'bg-white/5 border-white/10 hover:bg-white/10 cursor-pointer'
          }`}>
            <Paperclip size={16} className="text-white/40" />
            <input type="file" className="hidden" disabled={!canSend} onChange={e => setAttachment(e.target.files?.[0] || null)} />
          </label>
          <input
            ref={inputRef}
            value={newMessage}
            onChange={e => setNewMessage(e.target.value)}
            disabled={!canSend}
            placeholder={isChatOpen ? 'Ketik balasan...' : 'Chat tertutup...'}
            className={`flex-1 px-4 py-2.5 rounded-xl border text-sm outline-none transition-all ${
              !canSend
                ? 'bg-white/3 border-white/5 text-white/20 cursor-not-allowed'
                : 'bg-white/5 border-white/10 focus:ring-2 focus:ring-primary/30 text-white placeholder:text-white/20'
            }`}
          />
          <button type="submit" disabled={!canSend || (!newMessage.trim() && !attachment)}
            className="bg-primary text-white px-4 py-2.5 rounded-xl disabled:opacity-30 transition-all hover:opacity-90 shrink-0 flex items-center gap-2 text-[11px] font-black uppercase">
            {isSending ? <Loader2 size={15} className="animate-spin" /> : <><Send size={14} /> Kirim</>}
          </button>
        </form>
      </div>
    </div>
  );
};

// ── Main Page ─────────────────────────────────────────────────────────────

const MonitoringPICPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [currentUser, setCurrentUser] = useState<{ id: string; full_name: string; role?: string } | null>(null);
  const [myDepts, setMyDepts] = useState<Department[]>([]);
  const [activeDeptId, setActiveDeptId] = useState<string | null>(null);
  const [selectedSurat, setSelectedSurat] = useState<SuratItem | null>(null);
  const [search, setSearch] = useState('');
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});

  useEffect(() => {
    const totalUnread = Object.values(unreadMap).reduce((sum, n) => sum + (n || 0), 0);
    window.dispatchEvent(new CustomEvent('pic-unread-count', { detail: { count: totalUnread } }));
  }, [unreadMap]);

  const deptLabel = (dept: Department) => dept.code || dept.name;
  const isFinanceDept = (dept: Department) => {
    const code = (dept.code ?? '').toLowerCase();
    const name = dept.name.toLowerCase();
    return code.includes('keu') || name.includes('keuangan') || name.includes('akuntansi');
  };
  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const [profileRes, deptRes] = await Promise.all([
        supabase.from('profiles').select('id, full_name, role').eq('id', user.id).single(),
        supabase.from('master_dept_pics')
          .select('dept_id, master_departments(id, name, code)')
          .eq('user_id', user.id),
      ]);
      const profile = profileRes.data as { id: string; full_name: string; role?: string } | null;
      if (profile) {
        setCurrentUser(profile);
      }

      if (deptRes.data) {
        const depts = deptRes.data.map((d: any) => d.master_departments).filter(Boolean) as Department[];
        setMyDepts(depts);
        if (depts.length > 0) setActiveDeptId(depts[0].id);
      }
    };
    init();
  }, []);

  const { data: suratList = [], isLoading, refetch } = useQuery<SuratItem[]>({
    queryKey: ['pic-chat-list', currentUser?.id, myDepts.map(d => d.id).join(',')],
    enabled: !!currentUser && myDepts.length > 0,
    queryFn: async () => {
      const deptIds = myDepts.map(d => d.id);
      if (deptIds.length === 0) return [];
      const financeDept = myDepts.find(isFinanceDept);

      let baseRows: any[] = [];
      const { data: forms } = await supabase
        .from('master_forms').select('id, department_id').in('department_id', deptIds);
      if (forms?.length) {
        const formIds = forms.map((f: any) => f.id);

        const { data: penggunaans } = await supabase
          .from('master_penggunaan_detail').select('id, form_id').in('form_id', formIds);
        if (penggunaans?.length) {
          const penggunaanIds = penggunaans.map((p: any) => p.id);

          const { data, error } = await supabase
            .from('surat_registrasi')
            .select(`
              id, no_surat, judul_surat, status, pic_id,
              pic_review_status, pic_attachment, pic_note,
              chat_status, updated_at, created_by,
              file_path, lampiran_path,
              surat_attachments(id, file_url, file_name, file_type, file_size),
              creator:profiles!surat_registrasi_created_by_fkey(full_name),
              penggunaan:master_penggunaan_detail!surat_registrasi_penggunaan_id_fkey(
                form_id,
                master_forms(department_id, nama_form,
                  master_departments(id, name, code)
                )
              ),
              finance_reviews(id, payment_file_path, status)
            `)
            .eq('status', 'DONE')
            .in('penggunaan_id', penggunaanIds)
            .order('updated_at', { ascending: false });

          if (error) throw error;
          baseRows = data ?? [];
        }
      }

      const allRows = [...baseRows];

      if (financeDept) {
        const financeStatuses = ['KEUANGAN', 'KEUANGAN_DONE', 'KEUANGAN_REJECTED'];
        const { data: financeRows, error: financeError } = await supabase
          .from('surat_registrasi')
          .select(`
            id, no_surat, judul_surat, status, pic_id,
            pic_review_status, pic_attachment, pic_note,
            chat_status, updated_at, created_by,
            file_path, lampiran_path,
            surat_attachments(id, file_url, file_name, file_type, file_size),
            creator:profiles!surat_registrasi_created_by_fkey(full_name),
            penggunaan:master_penggunaan_detail!surat_registrasi_penggunaan_id_fkey(
              form_id,
              master_forms(department_id, nama_form,
                master_departments(id, name, code)
              )
            ),
            finance_reviews(id, payment_file_path, status)
          `)
          .eq('status', 'DONE')
          .in('pic_review_status', financeStatuses)
          .order('updated_at', { ascending: false });

        if (financeError) throw financeError;

        const existingIds = new Set(allRows.map((row: any) => row.id));
        (financeRows ?? []).forEach((row: any) => {
          if (!existingIds.has(row.id)) allRows.push(row);
        });
      }

      // Unread count
      const suratIds = allRows.map((s: any) => s.id);
      const newUnreadMap: Record<string, number> = {};
      if (suratIds.length > 0) {
        const { data: unreadData } = await supabase
          .from('surat_chats').select('surat_id')
          .in('surat_id', suratIds)
          .eq('sender_role', 'creator')
          .eq('is_read', false)
          .eq('is_system', false);
        (unreadData ?? []).forEach((r: any) => {
          newUnreadMap[r.surat_id] = (newUnreadMap[r.surat_id] || 0) + 1;
        });
      }
      setUnreadMap(newUnreadMap);

      // finance_review_id untuk surat KEUANGAN (pending)
      const financeReviewMap: Record<string, string> = {};
      // ✅ FIX 7: payment_file_path map untuk semua surat yang punya finance_review
      const paymentFileMap: Record<string, string | null> = {};

      allRows.forEach((s: any) => {
        const fr = s.finance_reviews?.[0];
        if (fr) {
          if (fr.status === 'PENDING') financeReviewMap[s.id] = fr.id;
          if (fr.payment_file_path) paymentFileMap[s.id] = fr.payment_file_path;
        }
      });

      return allRows.map((s: any) => {
        const formDept = s.penggunaan?.master_forms?.master_departments;
        return {
          ...s,
          creator_name: s.creator?.full_name ?? null,
          form_dept_id: formDept?.id ?? '',
          form_dept_name: formDept?.name ?? '',
          finance_review_id: financeReviewMap[s.id] ?? null,
          // ✅ payment_file_path sekarang tersedia di setiap surat
          payment_file_path: paymentFileMap[s.id] ?? null,
        };
      });
    },
    refetchInterval: 30_000,
  });

  const selectedSuratRef = useRef<SuratItem | null>(null);
  useEffect(() => { selectedSuratRef.current = selectedSurat; }, [selectedSurat]);

  useEffect(() => {
    if (!currentUser || suratList.length === 0) return;
    const suratIds = suratList.map(s => s.id);

    const ch = supabase
      .channel('pic-unread-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'surat_chats' }, (payload) => {
        const msg = payload.new as any;
        if (!suratIds.includes(msg.surat_id)) return;
        if (msg.sender_role !== 'creator' || msg.is_system) return;
        if (selectedSuratRef.current?.id === msg.surat_id) {
          picService.markCreatorChatsRead(msg.surat_id).catch((error) => {
            console.error('Failed to mark creator chats as read from realtime insert', error);
          });
        } else {
          setUnreadMap(prev => ({ ...prev, [msg.surat_id]: (prev[msg.surat_id] || 0) + 1 }));
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'surat_chats' }, (payload) => {
        const msg = payload.new as any;
        const old = payload.old as any;
        if (!old.is_read && msg.is_read && msg.sender_role === 'creator') {
          setUnreadMap(prev => ({ ...prev, [msg.surat_id]: Math.max(0, (prev[msg.surat_id] ?? 0) - 1) }));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [currentUser, suratList]);

  const handleSelectSurat = useCallback(async (surat: SuratItem) => {
    setSelectedSurat(surat);
    setUnreadMap(prev => ({ ...prev, [surat.id]: 0 }));
    picService.markCreatorChatsRead(surat.id).catch((error) => {
      console.error('Failed to mark creator chats as read on select surat', error);
    });
  }, []);

  const keuanganDept = myDepts.find(d => d.code === 'KEU');

  // ✅ FIX 8: surat masuk tab Keuangan juga jika KEUANGAN_DONE / KEUANGAN_REJECTED
  const suratBelongsToDept = (s: SuratItem, deptId: string) => {
    if (s.form_dept_id === deptId) return true;
    if (keuanganDept && deptId === keuanganDept.id &&
      ['KEUANGAN', 'KEUANGAN_DONE', 'KEUANGAN_REJECTED'].includes(s.pic_review_status ?? '')) {
      return true;
    }
    return false;
  };

  const filteredByDept = suratList.filter(s => activeDeptId ? suratBelongsToDept(s, activeDeptId) : false);
  const filteredSurat = filteredByDept.filter(s =>
    s.judul_surat?.toLowerCase().includes(search.toLowerCase()) ||
    s.no_surat?.toLowerCase().includes(search.toLowerCase())
  );

  const unreadPerDept = (deptId: string) =>
    suratList.filter(s => suratBelongsToDept(s, deptId) && (unreadMap[s.id] ?? 0) > 0).length;

  const sortedDepts = useMemo(() => {
    const originalOrder = new Map(myDepts.map((dept, index) => [dept.id, index]));
    const financeDeptId = keuanganDept?.id;
    const belongsToDept = (s: SuratItem, deptId: string) => {
      if (s.form_dept_id === deptId) return true;
      if (
        financeDeptId &&
        deptId === financeDeptId &&
        ['KEUANGAN', 'KEUANGAN_DONE', 'KEUANGAN_REJECTED'].includes(s.pic_review_status ?? '')
      ) {
        return true;
      }
      return false;
    };
    const getUnread = (deptId: string) =>
      suratList.filter(s => belongsToDept(s, deptId) && (unreadMap[s.id] ?? 0) > 0).length;

    return [...myDepts].sort((a, b) => {
      const unreadDiff = getUnread(b.id) - getUnread(a.id);
      if (unreadDiff !== 0) return unreadDiff;
      return (originalOrder.get(a.id) ?? 0) - (originalOrder.get(b.id) ?? 0);
    });
  }, [myDepts, suratList, unreadMap, keuanganDept?.id]);

  const handleActionComplete = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['pic-chat-list'] });
  }, [queryClient]);

  if (!currentUser) {
    return (
      <div className="flex items-center justify-center h-screen bg-[#080a0f]">
        <Loader2 size={24} className="animate-spin text-primary/40" />
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-[#080a0f] text-white overflow-hidden">

      {/* ── SIDEBAR KIRI ── */}
      <div className="w-[300px] shrink-0 flex flex-col border-r border-white/5 bg-[#0a0c12]">

        <div className="px-5 pt-5 pb-4 border-b border-white/5">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <MessageSquare size={15} className="text-primary" />
              <h1 className="text-sm font-black uppercase tracking-[0.15em]">Antrian PIC</h1>
            </div>
            <button onClick={() => refetch()} className="p-1.5 rounded-lg hover:bg-white/5 text-white/30 hover:text-white/60 transition-all">
              <RefreshCw size={13} />
            </button>
          </div>
          <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest">{currentUser.full_name}</p>
        </div>

        {/* Tab departemen */}
        {myDepts.length > 1 && (
          <div className="flex gap-1 border-b border-white/5 overflow-x-auto shrink-0 px-3 py-2">
            {sortedDepts.map(dept => {
              const unread = unreadPerDept(dept.id);
              const isActive = activeDeptId === dept.id;
              return (
                <button key={dept.id}
                  onClick={() => { setActiveDeptId(dept.id); setSelectedSurat(null); }}
                  title={dept.name}
                  className={`shrink-0 min-w-[96px] max-w-[160px] px-3 py-2 text-[9px] font-black uppercase tracking-wider border-b-2 transition-all flex items-center justify-center gap-1.5 whitespace-nowrap rounded-t-lg ${
                    isActive ? 'border-primary text-primary' : 'border-transparent text-white/30 hover:text-white/60'
                  }`}>
                  <span className="truncate">{deptLabel(dept)}</span>
                  {unread > 0 && (
                    <span className="bg-red-500 text-white text-[8px] font-black px-1 py-0.5 rounded-full min-w-[16px] text-center">
                      {unread}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {myDepts.length === 1 && (
          <div className="px-5 py-2 border-b border-white/5">
            <p className="text-[9px] font-black uppercase tracking-widest text-white/30">
              Dept: <span className="text-primary">{myDepts[0].name}</span>
            </p>
          </div>
        )}

        <div className="px-4 py-3 border-b border-white/5">
          <div className="relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Cari pengajuan..."
              className="w-full pl-8 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-[11px] outline-none focus:ring-1 focus:ring-primary/40 placeholder:text-white/20 text-white" />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Loader2 size={18} className="animate-spin text-primary/30" />
              <p className="text-[9px] font-bold text-white/20 uppercase tracking-widest">Memuat...</p>
            </div>
          ) : filteredSurat.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 opacity-20">
              <Inbox size={28} strokeWidth={1} />
              <p className="text-[9px] font-bold uppercase tracking-widest">Tidak ada pengajuan</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {filteredSurat.map(surat => {
                const badge = getStatusBadge(surat);
                const isActive = selectedSurat?.id === surat.id;
                return (
                  <button key={surat.id} onClick={() => handleSelectSurat(surat)}
                    className={`w-full text-left px-4 py-3.5 transition-all hover:bg-white/3 relative ${
                      isActive ? 'bg-primary/5 border-l-2 border-primary' : 'border-l-2 border-transparent'
                    }`}>
                    {(unreadMap[surat.id] ?? 0) > 0 && (
                      <span className="absolute top-3 right-3 bg-red-500 text-white text-[8px] font-black px-1.5 py-0.5 rounded-full">
                        {unreadMap[surat.id]}
                      </span>
                    )}
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <div className={`flex items-center gap-1 text-[8px] font-black uppercase px-1.5 py-0.5 rounded border ${badge.color}`}>
                        {badge.label}
                      </div>
                      <span className="text-[8px] text-white/20 font-mono shrink-0">
                        {formatDistanceToNow(new Date(surat.updated_at), { addSuffix: true, locale: localeID })}
                      </span>
                    </div>
                    <p className={`text-[11px] font-bold truncate leading-tight mb-1 ${isActive ? 'text-primary' : 'text-white/80'}`}>
                      {surat.judul_surat}
                    </p>
                    <p className="text-[8px] font-mono text-white/20 truncate mb-1">{surat.no_surat}</p>
                    {surat.creator_name && (
                      <p className="text-[9px] text-white/30">
                        Oleh: <span className="font-bold text-white/50">{surat.creator_name}</span>
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── PANEL KANAN ── */}
      {!selectedSurat ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 opacity-10 select-none">
          <MessageSquare size={52} strokeWidth={1} />
          <div className="text-center">
            <p className="text-xs font-black uppercase tracking-[0.2em]">Pilih Pengajuan</p>
            <p className="text-[9px] text-white/50 mt-1 uppercase tracking-widest font-bold">untuk mulai diskusi</p>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-hidden">
          <ChatPanel
            key={selectedSurat.id}
            surat={selectedSurat}
            currentUser={currentUser}
            isFinanceUser={!!keuanganDept && activeDeptId === keuanganDept.id}
            onActionComplete={handleActionComplete}
          />
        </div>
      )}
    </div>
  );
};

export default MonitoringPICPage;
