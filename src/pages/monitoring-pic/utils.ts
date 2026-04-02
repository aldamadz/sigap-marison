import { supabase } from '@/lib/supabase';
import { SuratItem } from './Types';
import { CheckCircle2, Clock, XCircle, FileText } from 'lucide-react';
import React from 'react';

// ── Storage URL resolver ──────────────────────────────────────────────────
export const getFileUrl = (path: string | null | undefined): string | null => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  const bucket =
    path.startsWith('spk_files/')     ? 'spk_files' :
    path.startsWith('payment_files/') ? 'payment_files' :
    path.startsWith('chat_attachments/') ? 'chat_attachments' :
    'dokumen_surat';
  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
};

// ── Status badge ──────────────────────────────────────────────────────────
export const STATUS_MAP: Record<string, { label: string; color: string }> = {
  PENDING:           { label: 'Menunggu Review',    color: 'text-amber-600 bg-amber-500/10 border-amber-500/20' },
  KEUANGAN:          { label: 'Proses Keuangan',    color: 'text-blue-600 bg-blue-500/10 border-blue-500/20' },
  KEUANGAN_DONE:     { label: 'Keuangan Selesai',   color: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20' },
  KEUANGAN_REJECTED: { label: 'Ditolak Keuangan',   color: 'text-red-600 bg-red-500/10 border-red-500/20' },
  SPK:               { label: 'SPK Diterbitkan',    color: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20' },
  REJECTED:          { label: 'Ditolak PIC',        color: 'text-red-600 bg-red-500/10 border-red-500/20' },
};

export const getStatusBadge = (surat: SuratItem) => {
  const r = surat.pic_review_status;
  if (r && STATUS_MAP[r]) return STATUS_MAP[r];
  return { label: 'Menunggu PIC', color: 'text-slate-500 bg-slate-500/10 border-slate-500/20' };
};

export const StatusIcon = ({ surat }: { surat: SuratItem }) => {
  const r = surat.pic_review_status;
  if (r === 'SPK' || r === 'KEUANGAN_DONE' || r === 'KEUANGAN')
    return React.createElement(CheckCircle2, { size: 13, className: r === 'KEUANGAN' ? 'text-blue-600' : 'text-emerald-600' });
  if (r === 'REJECTED' || r === 'KEUANGAN_REJECTED')
    return React.createElement(XCircle, { size: 13, className: 'text-red-600' });
  if (r === 'PENDING')
    return React.createElement(Clock, { size: 13, className: 'text-amber-600' });
  return React.createElement(Clock, { size: 13, className: 'text-slate-400' });
};

// ── Upload file helper ────────────────────────────────────────────────────
export const uploadFile = async (file: File, bucket: string, prefix: string, suratId: string): Promise<string> => {
  const path = `${prefix}/${suratId}-${Date.now()}.${file.name.split('.').pop()}`;
  const { error } = await supabase.storage.from(bucket).upload(path, file);
  if (error) throw error;
  return path;
};