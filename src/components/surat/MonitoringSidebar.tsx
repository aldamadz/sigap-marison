import React, { useState } from 'react';
import { Search, User, Users, ChevronRight, CheckCircle2, Clock, FileText, Paperclip } from 'lucide-react';
import { SuratRegistrasi } from '@/types/surat';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface SidebarProps {
  list: SuratRegistrasi[];
  selectedId?: string;
  activeTab: 'MY_SURAT' | 'OTHERS';
  onTabChange: (tab: 'MY_SURAT' | 'OTHERS') => void;
  onSelect: (id: string) => void;
  onSearch: (term: string) => void;
}

export const MonitoringSidebar: React.FC<SidebarProps> = ({ list, selectedId, activeTab, onTabChange, onSelect, onSearch }) => {
  const [searchValue, setSearchValue] = useState('');

  const handleSearchChange = (value: string) => {
    setSearchValue(value);
    onSearch(value);
  };

  const filteredList = list.filter((s: SuratRegistrasi) =>
    s.judul_surat?.toLowerCase().includes(searchValue.toLowerCase()) ||
    s.no_surat?.toLowerCase().includes(searchValue.toLowerCase())
  );

  const getAttachments = (surat: SuratRegistrasi) => {
    const attachments = Array.isArray(surat?.surat_attachments) ? surat.surat_attachments : [];
    if (attachments.length > 0) return attachments;
    return surat?.lampiran_path
      ? [{ id: 'legacy-lampiran', file_url: surat.lampiran_path, file_name: surat.lampiran_path.split('/').pop() }]
      : [];
  };

  const getStepLabel = (s: SuratRegistrasi) => {
    const currentSigner = s.surat_signatures?.find(sig => sig.step_order === s.current_step);
    return currentSigner?.role_name || 'Menunggu';
  };

  const signedCount = list.filter(s => s.status === 'SELESAI').length;
  const pendingCount = list.filter(s => s.status !== 'SELESAI').length;

  return (
    <div className="w-[420px] shrink-0 flex flex-col border-r bg-[#0a0c12] h-full">
      {/* HEADER */}
      <div className="p-6 border-b border-white/5 bg-[#0d0f16]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
              <FileText size={16} className="text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-white">Monitoring Surat</h2>
              <p className="text-[9px] text-white/30 font-bold uppercase tracking-widest">Tracking & Progress</p>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="flex bg-white/5 p-1 rounded-xl mb-4">
          <button
            onClick={() => onTabChange('MY_SURAT')}
            className={cn(
              "flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2",
              activeTab === 'MY_SURAT' ? "bg-primary text-white shadow-sm" : "text-white/40 hover:text-white/60"
            )}
          >
            <User size={12} /> Surat Saya
          </button>
          <button
            onClick={() => onTabChange('OTHERS')}
            className={cn(
              "flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center justify-center gap-2",
              activeTab === 'OTHERS' ? "bg-primary text-white shadow-sm" : "text-white/40 hover:text-white/60"
            )}
          >
            <Users size={12} /> Terlibat
          </button>
        </div>

        {/* Stats */}
        <div className="flex gap-3 mb-4">
          <div className="flex-1 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2 text-center">
            <p className="text-lg font-black text-emerald-400">{signedCount}</p>
            <p className="text-[8px] font-bold uppercase text-emerald-400/60 tracking-widest">Selesai</p>
          </div>
          <div className="flex-1 bg-amber-500/10 border border-amber-500/20 rounded-xl px-3 py-2 text-center">
            <p className="text-lg font-black text-amber-400">{pendingCount}</p>
            <p className="text-[8px] font-bold uppercase text-amber-400/60 tracking-widest">Pending</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
          <Input
            placeholder="CARI JUDUL ATAU NOMOR..."
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="pl-9 bg-white/5 border-white/10 text-[10px] font-bold uppercase tracking-wider text-white placeholder:text-white/20 rounded-xl h-9"
          />
        </div>
      </div>

      {/* LIST */}
      <div className="flex-1 overflow-y-auto">
        {filteredList.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 gap-3 opacity-30">
            <FileText size={32} strokeWidth={1} className="text-white" />
            <p className="text-[9px] font-bold uppercase tracking-widest text-white">
              {searchValue ? 'Tidak ditemukan' : 'Belum ada surat'}
            </p>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {filteredList.map((s: SuratRegistrasi) => {
              const isActive = selectedId === s.id;
              const attachments = getAttachments(s);

              return (
                <div
                  key={s.id}
                  onClick={() => onSelect(s.id)}
                  className={cn(
                    "group cursor-pointer rounded-2xl border transition-all duration-300 p-4 relative overflow-hidden",
                    isActive
                      ? "bg-primary/5 border-primary shadow-md ring-1 ring-primary/20"
                      : "bg-white/5 border-white/10 hover:bg-white/8 hover:border-white/20"
                  )}
                >
                  {/* Status Badge & Date */}
                  <div className="flex justify-between items-start mb-3">
                    <Badge
                      variant={s.status === 'SELESAI' ? 'default' : 'secondary'}
                      className={cn(
                        "text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-lg",
                        s.status === 'SELESAI'
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      )}
                    >
                      {s.status === 'SELESAI' ? 'Selesai' : 'Pending'}
                    </Badge>
                    <span className="text-[9px] text-white/20 font-mono">
                      {new Date(s.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </span>
                  </div>

                  {/* Number & Title */}
                  <div className="mb-2">
                    <p className="text-[10px] font-mono font-bold text-primary mb-0.5">{s.no_surat || 'PENDING'}</p>
                    <h4 className={cn(
                      "text-sm font-bold leading-snug transition-colors line-clamp-2",
                      isActive ? "text-primary" : "text-white/80"
                    )}>
                      {s.judul_surat}
                    </h4>
                  </div>

                  {/* Attachments indicator */}
                  {attachments.length > 0 && (
                    <div className="flex items-center gap-1.5 mb-2">
                      <Paperclip size={10} className="text-white/30" />
                      <span className="text-[9px] text-white/30 font-bold">
                        {attachments.length} lampiran
                      </span>
                    </div>
                  )}

                  {/* Current Position */}
                  <div className="flex items-center gap-2 text-[10px]">
                    <Clock size={11} className="text-white/40" />
                    <span className="text-white/40">Posisi:</span>
                    <span className={cn(
                      "font-bold",
                      s.status === 'SELESAI' ? "text-emerald-400" : "text-blue-400"
                    )}>
                      {s.status === 'SELESAI' ? 'Selesai TTD' : getStepLabel(s)}
                    </span>
                  </div>

                  {/* Signature Progress - Shown when active */}
                  {isActive && s.surat_signatures && s.surat_signatures.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <p className="text-[9px] font-black uppercase tracking-widest text-white/30 mb-3">
                        Progress Tanda Tangan
                      </p>
                      <div className="space-y-2">
                        {s.surat_signatures
                          .sort((a, b) => a.step_order - b.step_order)
                          .map((sig) => (
                            <div key={sig.id} className="flex items-center gap-2.5">
                              <div className={cn(
                                "w-4 h-4 rounded-full flex items-center justify-center shrink-0",
                                sig.is_signed ? "bg-emerald-500/20 text-emerald-400" : "bg-white/10 text-white/30"
                              )}>
                                {sig.is_signed ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={cn(
                                  "text-[10px] font-bold truncate",
                                  sig.is_signed ? "text-white/70" : "text-white/30"
                                )}>
                                  {sig.role_name}
                                </p>
                                {sig.is_signed && (
                                  <p className="text-[8px] text-emerald-400 font-medium">
                                    Sudah TTD
                                  </p>
                                )}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}

                  {/* Active indicator */}
                  {!isActive && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <ChevronRight size={16} className="text-white/20" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};