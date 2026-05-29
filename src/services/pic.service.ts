import { supabase } from "@/lib/supabase";
import { notificationService } from "./notification.service";

// ── Types ──────────────────────────────────────────────────────────────────

export type PicAction = "SPK" | "KEUANGAN" | "REJECTED";

export interface ChatMessage {
  id: string;
  surat_id: string;
  sender_id: string;
  sender_name: string | null;
  sender_role: 'pic' | 'creator' | 'system';
  message: string;
  attachment_url: string | null;
  is_system: boolean;
  is_read: boolean;
  created_at: string;
}

export interface SuratPicDetail {
  id: string;
  no_surat: string;
  judul_surat: string;
  file_path: string | null;
  lampiran_path: string | null;
  pic_attachment: string | null;
  status: string;
  pic_review_status: string | null;
  pic_note: string | null;
  chat_status: "OPEN" | "CLOSED";
  chat_opened_at: string | null;
  chat_closed_at: string | null;
  pic_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  profiles?: { full_name: string }[] | null;
  penggunaan?: {
    form_id: string | null;
    master_forms?: {
      nama_form: string;
      department_id: string | null;
      master_departments?: {
        name: string;
        master_dept_pics?: { user_id: string; profiles?: { full_name: string } | null }[] | null;
      } | null;
    } | null;
  } | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const SURAT_SELECT = `
  id, no_surat, judul_surat, file_path, lampiran_path, pic_attachment,
  status, pic_review_status, pic_note,
  chat_status, chat_opened_at, chat_closed_at, pic_id,
  created_by, created_at, updated_at,
  profiles:created_by(full_name),
  penggunaan:master_penggunaan_detail!surat_registrasi_penggunaan_id_fkey(
    form_id,
    master_forms(nama_form, department_id,
      master_departments(name,
        master_dept_pics(user_id, profiles:user_id(full_name))
      )
    )
  )
`;

const CHAT_SELECT = `
  id, surat_id, sender_id, message,
  attachment_url, is_system, sender_name, sender_role, is_read, created_at
`;

// ── Service ────────────────────────────────────────────────────────────────

export const picService = {
  async markCreatorChatsReadBulk(suratIds: string[]): Promise<void> {
    if (!suratIds.length) return;

    const { error: rpcError } = await supabase.rpc("mark_pic_chats_read_bulk", {
      p_surat_ids: suratIds,
    });
    if (!rpcError) return;

    const { error } = await supabase
      .from("surat_chats")
      .update({ is_read: true })
      .in("surat_id", suratIds)
      .eq("sender_role", "creator")
      .eq("is_read", false)
      .eq("is_system", false);

    if (error) throw new Error(error.message);
  },

  async markCreatorChatsRead(suratId: string): Promise<void> {
    if (!suratId) return;
    await this.markCreatorChatsReadBulk([suratId]);
  },

  /**
   * Ambil antrian review PIC: status DONE, pic_review_status PENDING atau NULL.
   * Alias getReviewQueue untuk kompatibilitas MonitoringPICPage.
   */
  async getReviewQueue(): Promise<SuratPicDetail[]> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return [];

    // 1. Dept yang bisa dilihat user ini.
    // Role admin tidak otomatis menjadi PIC operasional; akses PIC selalu dari master_dept_pics.
    const { data: deptPics } = await supabase
      .from("master_dept_pics")
      .select("dept_id")
      .eq("user_id", user.id);
    const deptIds = (deptPics ?? []).map((d: any) => d.dept_id);

    if (deptIds.length === 0) return [];

    // 2. Form-form milik dept tersebut
    const { data: forms } = await supabase
      .from("master_forms")
      .select("id")
      .in("department_id", deptIds);

    if (!forms || forms.length === 0) return [];
    const formIds = forms.map((f: any) => f.id);

    // 3. Penggunaan_id yang pakai form tersebut
    const { data: penggunaans } = await supabase
      .from("master_penggunaan_detail")
      .select("id")
      .in("form_id", formIds);

    if (!penggunaans || penggunaans.length === 0) return [];
    const penggunaanIds = penggunaans.map((p: any) => p.id);

    // 4. Surat DONE yang pakai penggunaan tersebut
    const { data, error } = await supabase
      .from("surat_registrasi")
      .select(SURAT_SELECT)
      .eq("status", "DONE")
      .in("penggunaan_id", penggunaanIds)
      .order("updated_at", { ascending: false });

    if (error) { console.error("getReviewQueue error:", error); return []; }
    return (data || []).filter(
      (s: any) => !s.pic_review_status || s.pic_review_status === "PENDING"
    ) as unknown as SuratPicDetail[];
  },

  // Alias untuk kompatibilitas Header.tsx / pic-inbox query key
  async getPicInbox(): Promise<SuratPicDetail[]> {
    return this.getReviewQueue();
  },

  /**
   * Ambil riwayat chat satu surat.
   * Alias getChatHistory untuk kompatibilitas PICReviewDetail.
   */
  async getChatHistory(suratId: string): Promise<ChatMessage[]> {
    const { data, error } = await supabase
      .from("surat_chats")
      .select(CHAT_SELECT)
      .eq("surat_id", suratId)
      .order("created_at", { ascending: true });

    if (error) { console.error("getChatHistory error:", error); return []; }
    return (data || []) as ChatMessage[];
  },

  /**
   * Ambil detail satu surat beserta chat-nya.
   */
  async getSuratWithChats(suratId: string) {
    const [suratRes, chatsRes] = await Promise.all([
      supabase.from("surat_registrasi").select(SURAT_SELECT).eq("id", suratId).single(),
      supabase.from("surat_chats").select(CHAT_SELECT).eq("surat_id", suratId).order("created_at", { ascending: true }),
    ]);
    return {
      surat: suratRes.data as unknown as SuratPicDetail | null,
      chats: (chatsRes.data || []) as ChatMessage[],
    };
  },

  /**
   * PIC membuka chat — RPC pic_open_chat (SECURITY DEFINER).
   * Insert pesan sistem otomatis + notif ke pembuat.
   */
  async openChat(suratId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Tidak terautentikasi");
    const { error } = await supabase.rpc("pic_open_chat", { p_surat_id: suratId, p_pic_id: user.id });
    if (error) throw new Error(error.message);
  },

  /**
   * PIC menutup chat — RPC pic_close_chat (SECURITY DEFINER).
   * Insert pesan sistem penutup + notif ke pembuat.
   * RLS otomatis blokir pesan baru dari pembuat setelah ini.
   */
  async closeChat(suratId: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Tidak terautentikasi");
    const { error } = await supabase.rpc("pic_close_chat", { p_surat_id: suratId, p_pic_id: user.id });
    if (error) throw new Error(error.message);
  },

/**
   * Mengirim pesan otomatis dari sistem ke dalam chat.
   */
  async sendSystemMessage(suratId: string, message: string): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    
    const { error } = await supabase
      .from("surat_chats")
      .insert({
        surat_id: suratId,
        sender_id: user?.id || null, // Tetap catat siapa yang memicu sistem message jika perlu
        sender_name: "SYSTEM",
        sender_role: "system",
        message: message.trim(),
        is_system: true,
        is_read: false,
      });

    if (error) {
      console.error("sendSystemMessage error:", error);
      throw new Error(error.message);
    }
  },  

  /**
   * Kirim pesan chat.
   * Signature: (suratId, message, attachmentUrl?) — kompatibel dengan PICReviewDetail.
   * RLS blokir otomatis jika chat_status = CLOSED.
   */
  async sendMessage(
    suratId: string,
    message: string,
    attachmentUrl?: string | null,
    senderRole: 'pic' | 'creator' = 'creator'
  ): Promise<ChatMessage> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Tidak terautentikasi");

    const { data: profile } = await supabase
      .from("profiles").select("full_name").eq("id", user.id).single();

    const { data, error } = await supabase
      .from("surat_chats")
      .insert({
        surat_id:       suratId,
        sender_id:      user.id,
        sender_name:    profile?.full_name ?? "Unknown",
        sender_role:    senderRole,
        message:        message.trim(),
        attachment_url: attachmentUrl ?? null,
        is_system:      false,
        // Pesan non-system selalu unread untuk pihak penerima.
        is_read:        false,
      })
      .select(CHAT_SELECT)
      .single();

    if (error) throw new Error(error.message);

    const { data: surat } = await supabase
      .from("surat_registrasi")
      .select(`
        id, judul_surat, created_by, pic_id,
        penggunaan:master_penggunaan_detail!surat_registrasi_penggunaan_id_fkey(
          form_id,
          master_forms(
            department_id,
            master_departments(master_dept_pics(user_id))
          )
        )
      `)
      .eq("id", suratId)
      .maybeSingle();

    const recipientIds = new Set<string>();
    if (senderRole === "pic") {
      if (surat?.created_by && surat.created_by !== user.id) recipientIds.add(surat.created_by);
    } else {
      if (surat?.pic_id && surat.pic_id !== user.id) recipientIds.add(surat.pic_id);

      const deptPics = surat?.penggunaan?.master_forms?.master_departments?.master_dept_pics ?? [];
      deptPics.forEach((pic: any) => {
        if (pic.user_id && pic.user_id !== user.id) recipientIds.add(pic.user_id);
      });
    }

    recipientIds.forEach((recipientId) => {
      notificationService.createNotification(
        recipientId,
        "Pesan Diskusi Baru",
        `${profile?.full_name ?? "Pengguna"} mengirim pesan pada "${surat?.judul_surat ?? "pengajuan"}"`,
        "feedback",
        senderRole === "pic" ? "/surat/chat" : "/pic/monitoring"
      ).catch((notifError) => console.error("Chat notification error:", notifError));
    });

    // Workaround trigger DB "force_unread":
    // setelah PIC membalas, pastikan pesan creator di surat yang sama tetap terbaca oleh PIC.
    if (senderRole === "pic") {
      await supabase
        .from("surat_chats")
        .update({ is_read: true })
        .eq("surat_id", suratId)
        .eq("sender_role", "creator")
        .eq("is_read", false)
        .eq("is_system", false);
    }

    return data as ChatMessage;
  },

  /**
   * Upload file SPK ke storage dan update pic_attachment di surat_registrasi.
   * Signature: (suratId, storagePath) — kompatibel dengan PICReviewDetail.
   */
  async uploadSPK(suratId: string, filePath: string): Promise<void> {
    const publicUrl = /^https?:\/\//i.test(filePath)
      ? filePath
      : supabase.storage.from("spk_files").getPublicUrl(filePath).data.publicUrl;
    const { error } = await supabase
      .from("surat_registrasi")
      .update({ pic_attachment: publicUrl, updated_at: new Date().toISOString() })
      .eq("id", suratId);
    if (error) throw new Error(error.message);
  },

  /**
   * PIC mengambil keputusan akhir.
   * Signature: (suratId, action, note) — kompatibel dengan PICReviewDetail.
   * Mendukung action lama (SEND_SPK, TO_FINANCE, REJECT) dan baru (SPK, KEUANGAN, REJECTED).
   */
  async takeAction(
    suratId: string,
    action: "SEND_SPK" | "TO_FINANCE" | "REJECT" | PicAction,
    note: string = ""
  ): Promise<void> {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("Tidak terautentikasi");

    // TO_FINANCE pakai RPC khusus pic_to_finance (insert finance_review + notif)
    if (action === "TO_FINANCE" || action === "KEUANGAN") {
      const { error } = await supabase.rpc("pic_to_finance", {
        p_surat_id: suratId,
        p_pic_id:   user.id,
        p_note:     note,
      });
      if (error) throw new Error(error.message);
      return;
    }

    const actionMap: Record<string, PicAction> = {
      SEND_SPK:  "SPK",
      REJECT:    "REJECTED",
      SPK:       "SPK",
      REJECTED:  "REJECTED",
    };

    const mappedAction = actionMap[action];
    if (!mappedAction) throw new Error(`Action tidak valid: ${action}`);

    const { error } = await supabase.rpc("pic_take_action", {
      p_surat_id: suratId,
      p_pic_id:   user.id,
      p_action:   mappedAction,
      p_note:     note,
    });
    if (error) throw new Error(error.message);
  },

  /**
   * Subscribe realtime chat untuk satu surat.
   * Cleanup: supabase.removeChannel(channel)
   */
  subscribeChat(suratId: string, onNew: (msg: ChatMessage) => void) {
    return supabase
      .channel(`chat:${suratId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "surat_chats", filter: `surat_id=eq.${suratId}` },
        (payload) => onNew(payload.new as ChatMessage)
      )
      .subscribe();
  },

  /**
   * Subscribe realtime perubahan status surat.
   * Dipakai untuk lock input chat saat PIC menutup sesi.
   */
  subscribeSuratStatus(suratId: string, onChange: (row: Partial<SuratPicDetail>) => void) {
    return supabase
      .channel(`surat-status:${suratId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "surat_registrasi", filter: `id=eq.${suratId}` },
        (payload) => onChange(payload.new as Partial<SuratPicDetail>)
      )
      .subscribe();
  },
};
