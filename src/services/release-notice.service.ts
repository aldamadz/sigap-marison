import { supabase } from '@/lib/supabase';

export type ReleaseNotice = { id: string; publishedAt?: string; completedAt?: string; expiresAt: string; items: string[] };
export type ReleaseNoticeState = { serverNow: string; release: ReleaseNotice | null };
export type ReleaseNoticeAdmin = ReleaseNoticeState & {
  revision: number; draftContent: string; updatedAt: string;
  history: { revision: number; action: 'publish' | 'withdraw'; at: string; actorName: string; release: ReleaseNotice | null }[];
};

const rpc = async <T>(name: string, args?: Record<string, unknown>): Promise<T> => {
  const { data, error } = await supabase.rpc(name, args);
  if (error) {
    const message = error.code === '40001' ? 'Pengumuman telah diubah admin lain. Muat ulang dahulu.'
      : error.code === '42501' ? 'Sesi atau akses pengumuman tidak diizinkan.'
      : error.code === '22023' ? 'Isi pembaruan harus 5-1500 karakter, maksimal 10 baris.'
      : 'Pengumuman belum dapat diproses. Silakan coba lagi.';
    throw Error(message);
  }
  return data as T;
};

export const releaseNoticeService = {
  current: () => rpc<ReleaseNoticeState>('get_active_release_notice'),
  admin: () => rpc<ReleaseNoticeAdmin>('get_release_notice_admin'),
  update: (action: 'save' | 'publish' | 'withdraw', revision: number, content?: string, releaseId?: string) =>
    rpc<ReleaseNoticeAdmin>('update_release_notice', {
      p_action: action, p_expected_revision: revision, p_content: content ?? null, p_release_id: releaseId ?? null,
    }),
};
