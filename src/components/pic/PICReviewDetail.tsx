import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { picService, ChatMessage } from '@/services/pic.service';
import { documentPreviewService } from '@/services/document-preview.service';
import { supabase } from '@/lib/supabase';
import { appStorageService } from '@/services/storage.service';
import {
  Send, ShieldCheck, CreditCard, XCircle, Loader2,
  Paperclip, X, ExternalLink, UploadCloud,
  FileCheck, Eye, MessageSquare, FileText,
  User, LockOpen, Lock, AlertTriangle, CheckCircle2,
} from 'lucide-react';
import { toast } from 'react-hot-toast';

interface Props {
  surat: any;
  onActionComplete: () => void;
}

// ── Tipe aksi final PIC ───────────────────────────────────────────────────────
type FinalAction = 'SEND_SPK' | 'TO_FINANCE' | 'REJECT';

interface ActionConfig {
  action: FinalAction;
  label: string;
  description: string;
  confirmLabel: string;
  icon: React.ReactNode;
  colorClass: string;
  confirmClass: string;
  requireSPK?: boolean;
}

const ACTION_CONFIGS: ActionConfig[] = [
  {
    action: 'SEND_SPK',
    label: 'Kirim SPK',
    description: 'Finalisasi dokumen dan kirimkan SPK kepada pembuat. Status akan menjadi Selesai.',
    confirmLabel: 'Ya, Kirim SPK',
    icon: <ShieldCheck size={16} />,
    colorClass: 'bg-success/10 text-success border-success/30 hover:bg-success/20',
    confirmClass: 'bg-success text-white hover:bg-success/90',
    requireSPK: true,
  },
  {
    action: 'TO_FINANCE',
    label: 'Alihkan ke Keuangan',
    description: 'Teruskan dokumen ini ke Tim Keuangan untuk ditindaklanjuti. Status masih menunggu.',
    confirmLabel: 'Ya, Alihkan',
    icon: <CreditCard size={16} />,
    colorClass: 'bg-blue-500/10 text-blue-500 border-blue-500/30 hover:bg-blue-500/20',
    confirmClass: 'bg-blue-500 text-white hover:bg-blue-600',
  },
  {
    action: 'REJECT',
    label: 'Tolak',
    description: 'Tolak dokumen ini. Pembuat akan mendapat notifikasi penolakan.',
    confirmLabel: 'Ya, Tolak',
    icon: <XCircle size={16} />,
    colorClass: 'bg-destructive/10 text-destructive border-destructive/30 hover:bg-destructive/20',
    confirmClass: 'bg-destructive text-white hover:bg-destructive/90',
  },
];

// ── Modal Konfirmasi Aksi ─────────────────────────────────────────────────────
const ActionModal: React.FC<{
  config: ActionConfig;
  onConfirm: (note: string) => void;
  onCancel: () => void;
  isLoading: boolean;
}> = ({ config, onConfirm, onCancel, isLoading }) => {
  const [note, setNote] = useState('');

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="p-5 border-b border-border flex items-start gap-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${config.colorClass}`}>
            {config.icon}
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-tight">{config.label}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">{config.description}</p>
          </div>
        </div>

        {/* Note input */}
        <div className="p-5 space-y-3">
          <label className="block">
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              Catatan {config.action === 'REJECT' ? '(Wajib isi alasan)' : '(Opsional)'}
            </span>
            <textarea
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={
                config.action === 'REJECT'
                  ? 'Tuliskan alasan penolakan...'
                  : 'Tambahkan catatan jika diperlukan...'
              }
              rows={3}
              className="mt-2 w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-background outline-none focus:ring-2 focus:ring-primary/30 resize-none placeholder:text-muted-foreground/40"
            />
          </label>

          {config.action === 'REJECT' && !note.trim() && (
            <div className="flex items-center gap-2 text-[10px] text-amber-500 font-bold">
              <AlertTriangle size={12} /> Catatan alasan diperlukan untuk penolakan
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-5 pb-5 flex gap-3">
          <button
            onClick={onCancel}
            disabled={isLoading}
            className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-bold hover:bg-accent transition-colors disabled:opacity-50"
          >
            Batal
          </button>
          <button
            onClick={() => onConfirm(note)}
            disabled={isLoading || (config.action === 'REJECT' && !note.trim())}
            className={`flex-1 px-4 py-2.5 rounded-xl text-sm font-black uppercase tracking-wide transition-all disabled:opacity-40 flex items-center justify-center gap-2 ${config.confirmClass}`}
          >
            {isLoading ? <Loader2 size={16} className="animate-spin" /> : config.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Main Component ────────────────────────────────────────────────────────────
export const PICReviewDetail: React.FC<Props> = ({ surat: initialSurat, onActionComplete }) => {
  const queryClient = useQueryClient();

  const [suratData, setSuratData] = useState<any>(initialSurat);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [isTogglingChat, setIsTogglingChat] = useState(false);
  const [uploadingSPK, setUploadingSPK] = useState(false);
  const [isOpeningPdf, setIsOpeningPdf] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: string; full_name: string } | null>(null);
  const [activeModal, setActiveModal] = useState<ActionConfig | null>(null);
  const [isActing, setIsActing] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const deptPics = suratData?.penggunaan?.master_forms?.master_departments?.master_dept_pics ?? [];
  const isPIC = deptPics.some((dp: any) => dp.user_id === currentUser?.id) || !deptPics.length;
  const isChatOpen = suratData?.chat_status === 'OPEN';
  const canSend = isChatOpen && !isSending;

  // Sudah ada keputusan final?
  const isFinalised = suratData?.pic_review_status &&
    ['SPK', 'REJECTED', 'KEUANGAN_DONE', 'KEUANGAN_REJECTED'].includes(suratData.pic_review_status);

  // ── Auth ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('profiles').select('id, full_name').eq('id', user.id).single()
        .then(({ data }) => setCurrentUser(data));
    });
  }, []);

  useEffect(() => { setSuratData(initialSurat); }, [initialSurat]);

  // ── Load chat + mark read ─────────────────────────────────────────────────
  useEffect(() => {
    if (!suratData?.id) return;
    picService.getChatHistory(suratData.id).then(setMessages);

    supabase
      .from('surat_chats')
      .update({ is_read: true })
      .eq('surat_id', suratData.id)
      .eq('sender_role', 'creator')
      .eq('is_read', false)
      .then(() => {
        // Trigger sidebar untuk re-fetch badge
        window.dispatchEvent(new CustomEvent('chat-read'));
      });
  }, [suratData?.id]);

  // ── Realtime: chat ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!suratData?.id) return;
    const ch = picService.subscribeChat(suratData.id, (msg) => {
      setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
      // Pesan baru dari creator langsung mark read karena panel sedang terbuka
      if (msg.sender_role === 'creator' && !msg.is_system) {
        supabase.from('surat_chats').update({ is_read: true }).eq('id', msg.id)
          .then(() => { window.dispatchEvent(new CustomEvent('chat-read')); });
      }
    });
    return () => { supabase.removeChannel(ch); };
  }, [suratData?.id]);

  // ── Realtime: surat status ────────────────────────────────────────────────
  useEffect(() => {
    if (!suratData?.id) return;
    const ch = picService.subscribeSuratStatus(suratData.id, (updated) => {
      setSuratData((prev: any) => ({ ...prev, ...updated }));
      if (updated.pic_review_status && updated.pic_review_status !== 'PENDING') {
        queryClient.invalidateQueries({ queryKey: ['review-queue'] });
        onActionComplete();
      }
    });
    return () => { supabase.removeChannel(ch); };
  }, [suratData?.id, queryClient, onActionComplete]);

  // ── Auto scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // ── Helpers ───────────────────────────────────────────────────────────────
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

  // ── Toggle Chat ───────────────────────────────────────────────────────────
  const handleToggleChat = useCallback(async () => {
    if (!isPIC) return toast.error("Hanya PIC yang dapat membuka/menutup chat");
    setIsTogglingChat(true);
    try {
      if (isChatOpen) {
        await picService.closeChat(suratData.id);
        toast.success("Chat ditutup");
      } else {
        await picService.openChat(suratData.id);
        toast.success("Chat dibuka");
      }
    } catch (err: any) {
      toast.error(err.message || "Gagal mengubah status chat");
    } finally {
      setIsTogglingChat(false);
    }
  }, [isPIC, isChatOpen, suratData?.id]);

  // ── Upload SPK ────────────────────────────────────────────────────────────
  const handleSPKUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingSPK(true);
    const toastId = toast.loading("Mengunggah SPK...");
    try {
      const fileName = `spk-${suratData.id}-${Date.now()}.${file.name.split('.').pop()}`;
      const filePath = `spk_files/${fileName}`;
      const uploaded = await appStorageService.upload({ bucket: 'spk_files', path: filePath, file });
      await picService.uploadSPK(suratData.id, uploaded.publicUrl);
      setSuratData((prev: any) => ({ ...prev, pic_attachment: uploaded.publicUrl }));
      toast.success("SPK berhasil diunggah", { id: toastId });
      queryClient.invalidateQueries({ queryKey: ['review-queue'] });
    } catch (err: any) {
      toast.error("Gagal mengunggah", { id: toastId });
    } finally {
      setUploadingSPK(false);
    }
  };

  // ── Kirim pesan ───────────────────────────────────────────────────────────
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() && !attachment) return;
    if (!isChatOpen) return toast.error("Chat sudah ditutup oleh PIC");
    setIsSending(true);
    try {
      let fileUrl: string | null = null;
      if (attachment) {
        const filePath = `chat_attachments/${Date.now()}-${attachment.name}`;
        const uploaded = await appStorageService.upload({ bucket: 'chat_attachments', path: filePath, file: attachment });
        fileUrl = uploaded.publicUrl;
      }
      await picService.sendMessage(suratData.id, newMessage, fileUrl, 'pic');
      setNewMessage('');
      setAttachment(null);
    } catch (err: any) {
      toast.error(err.message?.includes('new row violates')
        ? "Chat sudah ditutup, tidak dapat mengirim pesan"
        : "Gagal mengirim pesan");
    } finally {
      setIsSending(false);
    }
  };

  // ── Eksekusi aksi final ───────────────────────────────────────────────────
  const handleConfirmAction = async (note: string) => {
    if (!activeModal) return;
    if (activeModal.action === 'SEND_SPK' && !suratData.pic_attachment) {
      return toast.error("File SPK belum diunggah! Unggah SPK terlebih dahulu.");
    }
    setIsActing(true);
    try {
      await picService.takeAction(suratData.id, activeModal.action, note);
      toast.success(
        activeModal.action === 'SEND_SPK' ? 'SPK berhasil dikirim' :
        activeModal.action === 'TO_FINANCE' ? 'Dokumen dialihkan ke Keuangan' :
        'Dokumen ditolak'
      );
      setActiveModal(null);
      onActionComplete();
    } catch (err: any) {
      toast.error(err.message || "Aksi gagal");
    } finally {
      setIsActing(false);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full bg-background overflow-hidden border-l border-border relative">

      {/* MODAL KONFIRMASI */}
      {activeModal && (
        <ActionModal
          config={activeModal}
          onConfirm={handleConfirmAction}
          onCancel={() => setActiveModal(null)}
          isLoading={isActing}
        />
      )}

      {/* ── HEADER ──────────────────────────────────────────────────────── */}
      <div className="px-5 py-4 border-b border-border bg-card/95 backdrop-blur-md shrink-0">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[10px] font-bold bg-primary text-primary-foreground px-2 py-0.5 rounded flex items-center gap-1">
                <User size={10} /> {suratData.profiles?.[0]?.full_name || 'PEMBUAT'}
              </span>
              <span className="text-[10px] text-muted-foreground font-mono font-bold tracking-tight">
                {suratData.no_surat}
              </span>
            </div>
            <h2 className="text-sm font-extrabold text-foreground truncate uppercase tracking-tight">
              {suratData.judul_surat}
            </h2>
          </div>

          {/* Tombol dokumen */}
          <div className="flex items-center gap-1.5 shrink-0">
            {suratData.file_path && (
              <button
                onClick={openGeneratedPdf}
                disabled={isOpeningPdf}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase border bg-primary/5 text-primary border-primary/20 hover:bg-primary/10 transition-all disabled:opacity-60"
              >
                {isOpeningPdf ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />} Dokumen
              </button>
            )}
            {suratData.lampiran_path && (
              <button
                onClick={() => openStoredFile(suratData.lampiran_path)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase border bg-muted text-muted-foreground border-border hover:bg-accent transition-all"
              >
                <FileText size={12} /> Lampiran
              </button>
            )}
            {suratData.pic_attachment && (
              <button
                onClick={() => openStoredFile(suratData.pic_attachment)}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase border bg-success/5 text-success border-success/20 hover:bg-success/10 transition-all"
              >
                <FileCheck size={12} /> SPK
              </button>
            )}
          </div>
        </div>

        {/* ── AKSI FINAL PIC — hanya tampil jika PIC & belum finalisasi ── */}
        {isPIC && !isFinalised && (
          <div className="space-y-2">
            {/* Upload SPK bar */}
            <div className="flex items-center justify-between p-2.5 bg-secondary/50 rounded-xl border border-border/50">
              <div className="flex items-center gap-2">
                {suratData.pic_attachment ? (
                  <>
                    <CheckCircle2 size={14} className="text-success shrink-0" />
                    <span className="text-[10px] font-bold text-success">SPK sudah diunggah</span>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={14} className="text-amber-500 shrink-0" />
                    <span className="text-[10px] font-bold text-muted-foreground">
                      Unggah SPK sebelum finalisasi
                    </span>
                  </>
                )}
              </div>
              <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase cursor-pointer transition-all border ${
                uploadingSPK
                  ? 'opacity-50 pointer-events-none bg-muted border-border text-muted-foreground'
                  : 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20'
              }`}>
                {uploadingSPK ? <Loader2 size={12} className="animate-spin" /> : <UploadCloud size={12} />}
                {suratData.pic_attachment ? 'Ganti SPK' : 'Unggah SPK'}
                <input type="file" className="hidden" onChange={handleSPKUpload} disabled={uploadingSPK} />
              </label>
            </div>

            {/* Tiga tombol aksi utama */}
            <div className="grid grid-cols-3 gap-2">
              {ACTION_CONFIGS.map((cfg) => (
                <button
                  key={cfg.action}
                  onClick={() => setActiveModal(cfg)}
                  className={`flex flex-col items-center gap-1.5 px-2 py-3 rounded-xl border font-black text-[10px] uppercase tracking-wide transition-all active:scale-95 ${cfg.colorClass}`}
                >
                  {cfg.icon}
                  <span className="leading-tight text-center">{cfg.label}</span>
                </button>
              ))}
            </div>

            {/* Tombol buka / tutup chat */}
            <button
              onClick={handleToggleChat}
              disabled={isTogglingChat}
              className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl border text-[10px] font-black uppercase tracking-widest transition-all ${
                isChatOpen
                  ? 'bg-destructive/10 text-destructive border-destructive/20 hover:bg-destructive/20'
                  : 'bg-success/10 text-success border-success/20 hover:bg-success/20'
              }`}
            >
              {isTogglingChat
                ? <Loader2 size={12} className="animate-spin" />
                : isChatOpen
                  ? <><Lock size={12} /> Tutup Sesi Chat</>
                  : <><LockOpen size={12} /> Buka Sesi Chat</>
              }
            </button>
          </div>
        )}

        {/* Status jika sudah finalisasi */}
        {isFinalised && (
          <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 rounded-xl border border-border text-[10px] font-black uppercase text-muted-foreground">
            <CheckCircle2 size={12} className="text-success" />
            Dokumen ini sudah mendapat keputusan akhir
          </div>
        )}
      </div>

      {/* ── STATUS BAR CHAT ─────────────────────────────────────────────── */}
      <div className={`px-4 py-1.5 text-[10px] font-black uppercase tracking-widest flex items-center gap-2 border-b shrink-0 ${
        isChatOpen
          ? 'bg-success/10 text-success border-success/20'
          : 'bg-muted/40 text-muted-foreground border-border'
      }`}>
        {isChatOpen
          ? <><LockOpen size={11} /> Sesi diskusi aktif</>
          : <><Lock size={11} /> Chat tertutup</>
        }
      </div>

      {/* ── AREA CHAT ───────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 bg-background">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground opacity-20 py-10">
              <MessageSquare size={48} strokeWidth={1} className="mb-3" />
              <p className="text-xs font-black uppercase tracking-widest">Belum Ada Diskusi</p>
            </div>
          )}

          {messages.map((msg) => {
            const isMe = msg.sender_role === 'pic';

            if (msg.is_system) {
              return (
                <div key={msg.id} className="flex justify-center animate-in fade-in">
                  <div className="bg-muted/60 border border-border/50 rounded-full px-4 py-1.5 max-w-[85%]">
                    <p className="text-[10px] text-muted-foreground text-center leading-relaxed">
                      {msg.message}
                    </p>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={msg.id}
                className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}
              >
                <div className={`max-w-[78%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-2 mb-1 px-1">
                    <span className={`text-[10px] font-extrabold uppercase tracking-widest ${isMe ? 'text-primary' : 'text-muted-foreground'}`}>
                      {msg.sender_name ?? 'Unknown'}
                    </span>
                    <span className="text-[9px] text-muted-foreground/50 font-mono">
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className={`p-3.5 rounded-2xl border shadow-sm ${
                    isMe
                      ? 'bg-primary text-primary-foreground border-primary rounded-tr-none'
                      : 'bg-secondary text-secondary-foreground border-border rounded-tl-none'
                  }`}>
                    {msg.attachment_url && (
                      <button
                        type="button"
                        onClick={() => openStoredFile(msg.attachment_url!)}
                        className={`mb-2.5 p-2 rounded-lg flex items-center justify-between gap-4 border transition-all ${
                          isMe ? 'bg-black/20 border-white/10 hover:bg-black/30' : 'bg-background/40 border-border/50 hover:bg-background/60'
                        }`}
                      >
                        <span className="text-[9px] font-black uppercase tracking-widest flex items-center gap-2">
                          <Paperclip size={12} /> Lampiran
                        </span>
                        <ExternalLink size={12} />
                      </button>
                    )}
                    <p className="text-[13px] leading-relaxed font-medium whitespace-pre-wrap">
                      {msg.message}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── INPUT AREA ──────────────────────────────────────────────────── */}
      <div className="p-4 bg-card border-t border-border shrink-0">
        {!isChatOpen && (
          <div className="mb-3 p-2.5 bg-muted/50 rounded-xl border border-border text-center">
            <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              <Lock size={10} className="inline mr-1" /> Chat ditutup
            </p>
          </div>
        )}

        <form onSubmit={handleSendMessage} className="flex flex-col gap-2.5">
          {attachment && (
            <div className="flex items-center justify-between bg-primary/20 p-2.5 rounded-lg text-[10px] border border-primary/30 font-bold uppercase">
              <span className="truncate flex items-center gap-2 text-primary">
                <Paperclip size={14} /> {attachment.name}
              </span>
              <button type="button" onClick={() => setAttachment(null)} className="text-destructive">
                <X size={16} />
              </button>
            </div>
          )}
          <div className="flex gap-2.5">
            <label className={`p-2.5 rounded-xl cursor-pointer transition-all border flex items-center justify-center shrink-0 active:scale-95 ${
              !canSend ? 'bg-muted border-border opacity-40 pointer-events-none' : 'bg-secondary border-border hover:bg-accent'
            }`}>
              <Paperclip size={20} className="text-muted-foreground" />
              <input type="file" className="hidden" disabled={!canSend} onChange={(e) => setAttachment(e.target.files?.[0] || null)} />
            </label>
            <input
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              disabled={!canSend}
              placeholder={isChatOpen ? "Ketik pesan..." : "Chat tertutup..."}
              className={`flex-1 border rounded-xl px-4 text-sm outline-none transition-all font-medium ${
                !isChatOpen
                  ? 'bg-muted text-muted-foreground border-border cursor-not-allowed'
                  : 'bg-background border-border focus:ring-2 focus:ring-primary/50'
              }`}
            />
            <button
              type="submit"
              disabled={!canSend || (!newMessage.trim() && !attachment)}
              className="bg-primary text-primary-foreground p-2.5 rounded-xl hover:opacity-90 disabled:opacity-40 transition-all shrink-0 flex items-center justify-center active:scale-95"
            >
              {isSending ? <Loader2 size={22} className="animate-spin" /> : <Send size={22} />}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
