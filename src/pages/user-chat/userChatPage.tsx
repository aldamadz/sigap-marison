import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { picService, ChatMessage } from '@/services/pic.service';
import { documentPreviewService } from '@/services/document-preview.service';
import { appStorageService } from '@/services/storage.service';
import {
  Send, Paperclip, X, MessageSquare, ArrowLeft,
  FileText, FileCheck, ExternalLink, Loader2,
  CheckCircle2, Clock, XCircle, Inbox, Search,
  AlertCircle, Download, PanelLeft
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
  pic_review_status: string | null;
  pic_attachment: string | null;
  pic_note: string | null;
  chat_status: 'OPEN' | 'CLOSED';
  chat_opened_at: string | null;
  updated_at: string;
  pic_id: string | null;
  created_by: string;
  pic_name?: string | null;
  dept_name?: string | null;
  file_path?: string | null;
  lampiran_path?: string | null;
  surat_attachments?: Array<{
    id: string;
    file_url: string;
    file_name: string | null;
    file_type?: string | null;
    file_size?: number | null;
  }>;
  payment_file_path?: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────

const getStatusBadge = (surat: SuratItem) => {
  const r = surat.pic_review_status;
  if (r === 'SPK') return { label: 'SPK Diterbitkan', color: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20' };
  if (r === 'KEUANGAN') return { label: 'Tim Keuangan', color: 'text-blue-600 bg-blue-500/10 border-blue-500/20' };
  if (r === 'KEUANGAN_DONE') return { label: 'Keuangan Selesai', color: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20' };
  if (r === 'KEUANGAN_REJECTED') return { label: 'Ditolak Keuangan', color: 'text-red-600 bg-red-500/10 border-red-500/20' };
  if (r === 'REJECTED') return { label: 'Ditolak PIC', color: 'text-red-600 bg-red-500/10 border-red-500/20' };
  if (r === 'PENDING') return { label: 'Review PIC', color: 'text-amber-600 bg-amber-500/10 border-amber-500/20' };
  if (surat.status === 'DONE') return { label: 'Menunggu PIC', color: 'text-slate-500 bg-slate-500/10 border-slate-500/20' };
  return { label: surat.status, color: 'text-muted-foreground bg-muted border-border' };
};

const StatusIcon = ({ surat }: { surat: SuratItem }) => {
  const r = surat.pic_review_status;
  if (r === 'SPK') return <CheckCircle2 size={13} className="text-emerald-600" />;
  if (r === 'KEUANGAN') return <CheckCircle2 size={13} className="text-blue-600" />;
  if (r === 'KEUANGAN_DONE') return <CheckCircle2 size={13} className="text-emerald-600" />;
  if (r === 'KEUANGAN_REJECTED') return <XCircle size={13} className="text-red-600" />;
  if (r === 'REJECTED') return <XCircle size={13} className="text-red-600" />;
  if (r === 'PENDING') return <Clock size={13} className="text-amber-600" />;
  return <Clock size={13} className="text-slate-400" />;
};

const makePicNoteMsg = (surat: SuratItem): ChatMessage => ({
  id: `__pic_note__${surat.id}`,
  surat_id: surat.id,
  sender_id: surat.pic_id ?? '',
  sender_name: surat.pic_name ?? 'PIC',
  sender_role: 'pic',
  message: surat.pic_note ?? '',
  attachment_url: null,
  is_system: false,
  is_read: true,
  created_at: surat.updated_at,
});

// ── Main Component ────────────────────────────────────────────────────────

const UserChatPage: React.FC = () => {
  const queryClient = useQueryClient();
  const playNotif = useNotifSound();
  const playNotifRef = useRef(playNotif);
  useEffect(() => { playNotifRef.current = playNotif; }, [playNotif]);

  // Mobile view state - show sidebar or chat
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  const [selected, setSelected] = useState<SuratItem | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [chatStatus, setChatStatus] = useState<'OPEN' | 'CLOSED'>('CLOSED');
  const [newMessage, setNewMessage] = useState('');
  const [attachment, setAttachment] = useState<File | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: string; full_name: string } | null>(null);
  const [search, setSearch] = useState('');
  const [unreadMap, setUnreadMap] = useState<Record<string, number>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSend = chatStatus === 'OPEN' && !isSending;

  // ── Mobile detection ─────────────────────────────────────────────────
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const openStoredFile = useCallback((path: string) => {
    if (!selected?.id) return;
    documentPreviewService.openStoredFileInNewTab(selected.id, path)
      .catch((error: any) => toast.error(error.message || 'Gagal membuka file.'));
  }, [selected?.id]);

  // ── Auth ───────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('profiles').select('id, full_name').eq('id', user.id).single()
        .then(({ data }) => setCurrentUser(data));
    });
  }, []);

  // Handle mobile view changes
  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 768;
      setIsMobile(mobile);
      // On desktop, always show sidebar
      if (!mobile) {
        setShowSidebar(true);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // ── Realtime: update list surat ───────────────────────────────────────
  useEffect(() => {
    if (!currentUser) return;
    const ch = supabase
      .channel(`user-surat-list-sync:${currentUser.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'surat_registrasi', filter: `created_by=eq.${currentUser.id}` },
        (payload) => {
          const updated = payload.new as any;
          queryClient.setQueryData(
            ['user-chat-list', currentUser.id],
            (old: SuratItem[] | undefined) =>
              (old ?? []).map((s) =>
                s.id === updated.id
                  ? { ...s, chat_status: updated.chat_status, pic_review_status: updated.pic_review_status, pic_attachment: updated.pic_attachment, pic_note: updated.pic_note, updated_at: updated.updated_at }
                  : s
              )
          );
          if (selected?.id === updated.id) {
            setChatStatus(updated.chat_status);
            setSelected((prev) => prev ? ({ ...prev, ...updated }) : null);
          }
        }
      )
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [currentUser, queryClient, selected?.id]);

  // ── Fetch surat milik user ────────────────────────────────────────────
  const { data: suratList = [], isLoading } = useQuery<SuratItem[]>({
    queryKey: ['user-chat-list', currentUser?.id],
    enabled: !!currentUser,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('surat_registrasi')
        .select(`
          id, no_surat, judul_surat, status,
          pic_review_status, pic_note, chat_status, chat_opened_at, updated_at, pic_id, created_by,
          pic_attachment, file_path, lampiran_path,
          surat_attachments(id, file_url, file_name, file_type, file_size),
          pic_profile:profiles!surat_registrasi_pic_id_fkey(full_name),
          penggunaan:master_penggunaan_detail!surat_registrasi_penggunaan_id_fkey(
            master_forms(master_departments(name))
          ),
          finance_reviews(payment_file_path, status)
        `)
        .eq('created_by', currentUser!.id)
        .eq('status', 'DONE')
        .order('updated_at', { ascending: false });

      if (error) throw error;
      return (data || []).map((s: any) => ({
        ...s,
        pic_name: s.pic_profile?.full_name ?? s.pic_profile?.[0]?.full_name ?? null,
        dept_name: s.penggunaan?.master_forms?.master_departments?.name ?? null,
        payment_file_path: s.finance_reviews?.[0]?.payment_file_path ?? null,
      }));
    },
  });

  const filtered = suratList.filter(s =>
    s.judul_surat?.toLowerCase().includes(search.toLowerCase()) ||
    s.no_surat?.toLowerCase().includes(search.toLowerCase())
  );

  // ── Pilih surat ────────────────────────────────────────────────────────
  const handleSelect = useCallback(async (surat: SuratItem) => {
    setSelected(surat);
    setChatStatus(surat.chat_status ?? 'CLOSED');
    setMessages([]);
    setUnreadMap(prev => ({ ...prev, [surat.id]: 0 }));

    // On mobile, hide sidebar when chat selected
    if (isMobile) {
      setShowSidebar(false);
    }

    supabase.from('surat_chats')
      .update({ is_read: true })
      .eq('surat_id', surat.id)
      .eq('sender_role', 'pic')
      .eq('is_read', false)
      .eq('is_system', false)
      .then();

    const history = await picService.getChatHistory(surat.id);
    if (surat.pic_note) {
      const alreadyInHistory = history.some(m => m.id === `__pic_note__${surat.id}`);
      setMessages(alreadyInHistory ? history : [makePicNoteMsg(surat), ...history]);
    } else {
      setMessages(history);
    }
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [isMobile]);

  // Back button handler for mobile
  const handleBack = () => {
    setShowSidebar(true);
    setSelected(null);
  };

  useEffect(() => {
    if (selected) setChatStatus(selected.chat_status ?? 'CLOSED');
  }, [selected?.chat_status]);

  // ── Realtime: chat messages ──────────────────────────────────────────
  const selectedRef = useRef<SuratItem | null>(null);
  useEffect(() => { selectedRef.current = selected; }, [selected]);

  useEffect(() => {
    if (!selected) return;
    const ch = picService.subscribeChat(selected.id, (msg) => {
      setMessages(prev => prev.find(m => m.id === msg.id) ? prev : [...prev, msg]);
      if (msg.sender_role === 'pic' && !msg.is_system) {
        playNotifRef.current();
      }
    });
    return () => { supabase.removeChannel(ch); };
  }, [selected?.id]);

  // ── Unread badge dari PIC ─────────────────────────────────────────────
  useEffect(() => {
    if (!currentUser || suratList.length === 0) return;
    const suratIds = suratList.map(s => s.id);

    const fetchUnread = async () => {
      const { data } = await supabase
        .from('surat_chats').select('surat_id')
        .in('surat_id', suratIds)
        .eq('sender_role', 'pic')
        .eq('is_read', false)
        .eq('is_system', false);
      const map: Record<string, number> = {};
      (data ?? []).forEach((r: any) => { map[r.surat_id] = (map[r.surat_id] ?? 0) + 1; });
      setUnreadMap(map);
    };
    fetchUnread();

    const ch = supabase.channel(`user-chat-unread:${currentUser.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'surat_chats' }, (payload) => {
        const msg = payload.new as any;
        if (!suratIds.includes(msg.surat_id)) return;
        if (msg.sender_role !== 'pic' || msg.is_system) return;
        if (selectedRef.current?.id === msg.surat_id) {
          supabase.from('surat_chats').update({ is_read: true }).eq('id', msg.id).then();
        } else {
          playNotifRef.current();
          setUnreadMap(prev => ({ ...prev, [msg.surat_id]: (prev[msg.surat_id] ?? 0) + 1 }));
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'surat_chats' }, (payload) => {
        const msg = payload.new as any;
        const old = payload.old as any;
        if (!old.is_read && msg.is_read && msg.sender_role === 'pic') {
          setUnreadMap(prev => ({ ...prev, [msg.surat_id]: Math.max(0, (prev[msg.surat_id] ?? 0) - 1) }));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(ch); };
  }, [currentUser, suratList]);

  // ── Sync pic_note ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!selected) return;
    setMessages(prev => {
      const noteId = `__pic_note__${selected.id}`;
      const withoutNote = prev.filter(m => m.id !== noteId);
      return selected.pic_note ? [makePicNoteMsg(selected), ...withoutNote] : withoutNote;
    });
  }, [selected?.pic_note]);

  // ── Toast notif saat chat_status berubah ──────────────────────────────
  const prevChatStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!selected) return;
    const prev = prevChatStatusRef.current;
    const curr = selected.chat_status;
    if (prev !== null && prev !== curr) {
      if (curr === 'OPEN') {
        playNotifRef.current();
        toast.success('PIC membuka sesi diskusi — Anda dapat mengirim pesan', { duration: 4000 });
      } else {
        toast('Sesi diskusi ditutup oleh PIC', { icon: '🔒', duration: 4000 });
      }
    }
    prevChatStatusRef.current = curr;
  }, [selected?.chat_status]);

  // ── Auto scroll ────────────────────────────────────────────────────────
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  // ── Kirim pesan ────────────────────────────────────────────────────────
  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected || (!newMessage.trim() && !attachment)) return;
    if (chatStatus !== 'OPEN') return toast.error('Chat masih tertutup, tunggu PIC membuka sesi');
    setIsSending(true);
    try {
      let fileUrl: string | null = null;
      if (attachment) {
        const path = `chat_attachments/${Date.now()}-${attachment.name}`;
        const uploaded = await appStorageService.upload({ bucket: 'chat_attachments', path, file: attachment });
        fileUrl = uploaded.publicUrl;
      }
      await picService.sendMessage(selected.id, newMessage, fileUrl, 'creator');
      setNewMessage('');
      setAttachment(null);
    } catch (err: any) {
      toast.error(err.message?.includes('violates') ? 'Chat sudah tertutup' : 'Gagal mengirim pesan');
    } finally {
      setIsSending(false);
    }
  };

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-56px)] sm:h-[calc(100vh-64px)] bg-background text-foreground overflow-hidden font-sans">

      {/* ── SIDEBAR KIRI ── */}
      <div className={`
        ${showSidebar ? 'flex' : 'hidden'} 
        md:flex flex-col w-full md:w-72 lg:w-80 shrink-0 border-r border-border bg-card/20 backdrop-blur-xl
        h-full overflow-hidden
      `}>
        <div className="px-4 sm:px-5 pt-5 sm:pt-6 pb-3 sm:pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare size={16} className="text-primary" />
            <h1 className="text-sm font-black uppercase tracking-wider text-foreground">Diskusi Dokumen</h1>
          </div>
          <p className="text-[10px] sm:text-xs text-muted-foreground">Chat dengan PIC Departemen</p>
        </div>

        <div className="px-3 sm:px-4 py-2 sm:py-3 border-b border-border shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Cari dokumen..."
              className="w-full pl-9 pr-3 py-2 bg-background/50 border border-border rounded-lg text-xs outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/50"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-border/30 min-h-0">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 sm:py-16 gap-3">
              <Loader2 size={20} className="animate-spin text-primary/40" />
              <p className="text-xs text-muted-foreground">Memuat...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 sm:py-16 gap-3 opacity-30">
              <Inbox size={28} strokeWidth={1} />
              <p className="text-xs font-bold uppercase">Belum ada dokumen</p>
            </div>
          ) : (
            filtered.map((surat) => {
              const badge = getStatusBadge(surat);
              const isActive = selected?.id === surat.id;
              const unread = unreadMap[surat.id] ?? 0;
              return (
                <button
                  key={surat.id}
                  onClick={() => handleSelect(surat)}
                  className={`w-full text-left px-3 sm:px-4 py-3 sm:py-4 transition-all relative ${
                    isActive ? 'bg-primary/5 border-l-4 border-primary' : 'hover:bg-secondary/30 border-l-4 border-transparent'
                  }`}
                >
                  {unread > 0 && (
                    <span className="absolute top-2 sm:top-3 right-2 sm:right-3 min-w-[18px] h-[18px] flex items-center justify-center bg-primary text-primary-foreground text-[10px] font-black rounded-full px-1 animate-bounce">
                      {unread > 9 ? '9+' : unread}
                    </span>
                  )}
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className={`flex items-center gap-1 text-[10px] sm:text-xs font-black uppercase px-2 py-0.5 rounded border ${badge.color}`}>
                      <StatusIcon surat={surat} />
                      <span className="truncate">{badge.label}</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground/50 font-mono shrink-0">
                      {formatDistanceToNow(new Date(surat.updated_at), { addSuffix: true, locale: localeID })}
                    </span>
                  </div>
                  <p className={`text-xs sm:text-sm font-black uppercase truncate leading-tight mb-1 ${isActive ? 'text-primary' : 'text-foreground'}`}>
                    {surat.judul_surat}
                  </p>
                  <p className="text-[10px] sm:text-xs font-mono text-muted-foreground/60 truncate">{surat.no_surat}</p>
                  {surat.pic_name && (
                    <p className="text-[10px] sm:text-xs text-muted-foreground mt-1.5 truncate font-bold">
                      PIC: <span className="text-foreground/70">{surat.pic_name}</span>
                      {surat.dept_name && <span className="text-muted-foreground/50"> · {surat.dept_name}</span>}
                    </p>
                  )}
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* ── PANEL KANAN: CHAT ── */}
      <div className={`
        ${showSidebar ? 'hidden' : 'flex'} 
        md:flex flex-1 flex-col bg-background/50 relative overflow-hidden
        h-full
      `}>
        {!selected ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 opacity-10 select-none px-4">
            <MessageSquare size={64} strokeWidth={1} />
            <div className="text-center">
              <p className="text-sm sm:text-base font-black uppercase tracking-wider">Pilih Dokumen</p>
              <p className="text-xs sm:text-sm text-muted-foreground mt-2 uppercase font-bold">Untuk memulai diskusi dengan PIC</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col h-full overflow-hidden">

            {/* Header Chat - Mobile with Back Button */}
            <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-border bg-card/40 backdrop-blur-md flex justify-between items-center shrink-0 gap-3">
              <div className="min-w-0 flex items-center gap-2 sm:gap-3">
                {/* Back button for mobile */}
                <button 
                  onClick={handleBack}
                  className="md:hidden p-2 rounded-lg hover:bg-accent text-muted-foreground shrink-0"
                >
                  <ArrowLeft size={20} />
                </button>
                
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1 min-w-0">
                    <span className="text-xs font-mono text-muted-foreground/60 truncate">{selected.no_surat}</span>
                    <span className={`text-[10px] sm:text-xs font-black uppercase px-2 py-0.5 rounded border truncate ${getStatusBadge(selected).color}`}>
                      {getStatusBadge(selected).label}
                    </span>
                  </div>
                  <h2 className="text-sm sm:text-base font-black uppercase tracking-tight text-foreground truncate">{selected.judul_surat}</h2>
                  <p className="text-xs sm:text-sm text-muted-foreground font-bold mt-0.5 truncate">
                    Ditangani: <span className="text-foreground/70">{selected.pic_name ?? 'N/A'}</span>
                  </p>
                </div>
              </div>
            </div>

            {(selected.file_path || selected.surat_attachments?.length || selected.lampiran_path || selected.pic_attachment || selected.payment_file_path) && (
              <div className="px-4 sm:px-6 py-2 border-b border-border bg-background/70 shrink-0">
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {[
                    { label: 'Dokumen', icon: FileText, path: selected.file_path, show: !!selected.file_path },
                    ...(selected.surat_attachments?.length
                      ? selected.surat_attachments.map((attachment, index) => ({
                          label: `Lampiran ${index + 1}`,
                          icon: Paperclip,
                          path: attachment.file_url,
                          show: true,
                        }))
                      : [{ label: 'Lampiran', icon: Paperclip, path: selected.lampiran_path, show: !!selected.lampiran_path }]),
                    { label: 'SPK', icon: FileCheck, path: selected.pic_attachment, show: !!selected.pic_attachment },
                    { label: 'Bukti Transaksi', icon: FileCheck, path: selected.payment_file_path, show: !!selected.payment_file_path },
                  ].filter(item => item.show && item.path).map(({ label, icon: Icon, path }) => (
                    <button
                      type="button"
                      key={label}
                      onClick={() => openStoredFile(path!)}
                      className="h-8 px-3 rounded-lg border border-border bg-card hover:bg-accent flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-foreground shrink-0 transition-colors"
                    >
                      <Icon size={13} />
                      {label}
                      <ExternalLink size={10} className="opacity-50" />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {selected.pic_review_status === 'SPK' && !selected.pic_attachment && (
              <div className="px-4 sm:px-6 py-2 bg-amber-500/10 border-b border-amber-500/20 shrink-0">
                <p className="text-xs sm:text-sm font-bold text-amber-600">
                  Status SPK sudah diterbitkan, tetapi file SPK belum terlampir.
                </p>
              </div>
            )}

            {/* Messages Area */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 sm:space-y-6 scroll-smooth">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full gap-4 opacity-10">
                  <MessageSquare size={48} strokeWidth={1} />
                  <p className="text-xs sm:text-sm font-black uppercase tracking-widest text-center">Belum ada diskusi terbuka<br/>untuk dokumen ini</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isMe = msg.sender_id === currentUser?.id && msg.sender_role === 'creator' && !msg.id.startsWith('__pic_note__');
                  const isNote = msg.id.startsWith('__pic_note__');

                  if (msg.is_system) {
                    return (
                      <div key={msg.id} className="flex justify-center my-3 sm:my-4 animate-in fade-in zoom-in duration-300">
                        <div className="bg-secondary/40 border border-border/50 rounded-full px-4 sm:px-6 py-1.5 sm:py-2 shadow-sm backdrop-blur-sm">
                          <p className="text-[10px] sm:text-xs font-black text-muted-foreground uppercase tracking-tight text-center">{msg.message}</p>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={msg.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in fade-in slide-in-from-bottom-2`}>
                      <div className={`max-w-[85%] sm:max-w-[75%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                        <div className="flex items-center gap-2 mb-1 px-1">
                          <span className={`text-[10px] sm:text-xs font-black uppercase ${isMe ? 'text-primary' : 'text-muted-foreground'}`}>
                            {isMe ? 'Anda' : (msg.sender_name ?? 'PIC')}
                          </span>
                          {isNote && (
                            <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 border border-amber-500/20">
                              Catatan
                            </span>
                          )}
                          <span className="text-[10px] font-mono text-muted-foreground/30">
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <div className={`px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl shadow-sm text-xs sm:text-sm font-bold leading-relaxed whitespace-pre-wrap ${
                          isMe
                            ? 'bg-primary text-primary-foreground rounded-tr-none'
                            : isNote
                              ? 'bg-amber-500/5 border-2 border-dashed border-amber-500/20 text-foreground rounded-tl-none'
                              : 'bg-card border border-border text-foreground rounded-tl-none backdrop-blur-sm'
                        }`}>
                          {msg.attachment_url && (
                            <button
                              type="button"
                              onClick={() => openStoredFile(msg.attachment_url!)}
                              className={`flex items-center gap-2 mb-2 sm:mb-3 p-2 rounded-lg border text-[10px] sm:text-xs font-black uppercase ${
                                isMe ? 'bg-black/20 border-white/10 hover:bg-black/30' : 'bg-muted border-border hover:bg-accent'
                              }`}
                            >
                              <Paperclip size={12} /> Lampiran <ExternalLink size={10} className="ml-auto opacity-40" />
                            </button>
                          )}
                          {msg.message}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* Payment Proof Banner */}
            {selected.payment_file_path && (
              <div className="px-4 sm:px-6 py-2 bg-emerald-500/10 border-t border-emerald-500/20 shrink-0">
                <button
                  type="button"
                  onClick={() => openStoredFile(selected.payment_file_path!)}
                  className="flex items-center gap-2 text-emerald-600 hover:text-emerald-700 transition-colors"
                >
                  <FileCheck size={16} />
                  <span className="text-xs sm:text-sm font-bold">Bukti Transaksi Tersedia</span>
                  <ExternalLink size={12} className="ml-auto" />
                </button>
              </div>
            )}

            {/* Input Area */}
            <div className="p-3 sm:p-4 border-t border-border bg-card/40 backdrop-blur-sm shrink-0">
              {!canSend && chatStatus !== 'OPEN' && (
                <div className="mb-2 sm:mb-3 px-3 sm:px-4 py-2 sm:py-3 bg-amber-500/10 border border-amber-500/20 rounded-lg sm:rounded-xl flex items-center gap-2 sm:gap-3">
                  <AlertCircle size={14} className="text-amber-600 shrink-0" />
                  <p className="text-xs sm:text-sm font-bold text-amber-600">Sesi chat tertutup. Tunggu PIC membuka sesi.</p>
                </div>
              )}
              
              <form onSubmit={handleSend} className="flex items-end gap-2 sm:gap-3">
                <input
                  ref={inputRef}
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  disabled={!canSend}
                  placeholder={canSend ? "Tulis pesan..." : "Chat tertutup..."}
                  className="flex-1 min-w-0 px-3 sm:px-4 py-2.5 sm:py-3 bg-background/50 border border-border rounded-lg sm:rounded-xl text-xs sm:text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all placeholder:text-muted-foreground/50 disabled:opacity-50 disabled:cursor-not-allowed resize-none"
                  style={{ minHeight: '44px', maxHeight: '120px' }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (canSend && (newMessage.trim() || attachment)) handleSend(e);
                    }
                  }}
                />
                
                <input
                  ref={fileInputRef}
                  type="file"
                  onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
                  className="hidden"
                  disabled={!canSend}
                />
                
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={!canSend}
                  className={`p-2.5 sm:p-3 rounded-lg sm:rounded-xl border transition-all shrink-0 ${
                    attachment 
                      ? 'bg-primary text-primary-foreground border-primary' 
                      : 'bg-background/50 text-muted-foreground border-border hover:bg-accent'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <Paperclip size={18} />
                </button>
                
                <button
                  type="submit"
                  disabled={!canSend || (!newMessage.trim() && !attachment)}
                  className="p-2.5 sm:p-3 bg-primary text-primary-foreground rounded-lg sm:rounded-xl font-bold hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </form>
              
              {attachment && (
                <div className="mt-2 px-3 py-2 bg-accent/50 rounded-lg flex items-center justify-between text-xs">
                  <span className="flex items-center gap-2 truncate">
                    <FileText size={14} />
                    <span className="truncate">{attachment.name}</span>
                  </span>
                  <button 
                    onClick={() => setAttachment(null)}
                    className="p-1 hover:bg-destructive/10 rounded text-destructive shrink-0"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default UserChatPage;
