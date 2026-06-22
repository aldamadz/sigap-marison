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
    <div className="flex h-full w-[420px] shrink-0 flex-col border-r bg-sidebar">
      {/* HEADER */}
      <div className="border-b border-sidebar-border bg-sidebar p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10">
              <FileText size={16} className="text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-sidebar-foreground">Monitoring Surat</h2>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="mb-4 flex rounded-md bg-sidebar-accent p-1">
          <button
            onClick={() => onTabChange('MY_SURAT')}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded px-3 py-2 text-xs font-semibold transition-all",
              activeTab === 'MY_SURAT' ? "bg-primary text-white shadow-sm" : "text-sidebar-foreground/55 hover:text-sidebar-foreground"
            )}
          >
            <User size={12} /> Surat Saya
          </button>
          <button
            onClick={() => onTabChange('OTHERS')}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded px-3 py-2 text-xs font-semibold transition-all",
              activeTab === 'OTHERS' ? "bg-primary text-white shadow-sm" : "text-sidebar-foreground/55 hover:text-sidebar-foreground"
            )}
          >
            <Users size={12} /> Terlibat
          </button>
        </div>

        {/* Stats */}
        <div className="flex gap-3 mb-4">
          <div className="flex-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-center">
            <p className="text-lg font-semibold text-emerald-400">{signedCount}</p>
            <p className="text-xs font-medium text-emerald-400/70">Selesai</p>
          </div>
          <div className="flex-1 rounded-md border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-center">
            <p className="text-lg font-semibold text-amber-400">{pendingCount}</p>
            <p className="text-xs font-medium text-amber-400/70">Pending</p>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-sidebar-foreground/35" />
          <Input
            placeholder="Cari judul atau nomor"
            value={searchValue}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="h-10 border-sidebar-border bg-sidebar-accent pl-9 text-sm text-sidebar-foreground placeholder:text-sidebar-foreground/35"
          />
        </div>
      </div>

      {/* LIST */}
      <div className="flex-1 overflow-y-auto">
        {filteredList.length === 0 ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 opacity-50">
            <FileText size={32} strokeWidth={1} className="text-sidebar-foreground" />
            <p className="text-sm font-medium text-sidebar-foreground">
              {searchValue ? 'Tidak ditemukan' : 'Belum ada surat'}
            </p>
          </div>
        ) : (
          <div className="space-y-3 p-4">
            {filteredList.map((s: SuratRegistrasi) => {
              const isActive = selectedId === s.id;
              const attachments = getAttachments(s);

              return (
                <div
                  key={s.id}
                  onClick={() => onSelect(s.id)}
                  className={cn(
                    "group relative cursor-pointer overflow-hidden rounded-lg border p-4 transition-all duration-200",
                    isActive
                      ? "border-primary bg-primary/10 shadow-sm ring-1 ring-primary/20"
                      : "border-sidebar-border bg-sidebar-accent/60 hover:border-primary/35"
                  )}
                >
                  {/* Status Badge & Date */}
                  <div className="flex justify-between items-start mb-3">
                    <Badge
                      variant={s.status === 'SELESAI' ? 'default' : 'secondary'}
                      className={cn(
                        "px-2 py-0.5 text-[11px] font-semibold",
                        s.status === 'SELESAI'
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                      )}
                    >
                      {s.status === 'SELESAI' ? 'Selesai' : 'Pending'}
                    </Badge>
                    <span className="font-mono text-[11px] text-sidebar-foreground/45">
                      {new Date(s.created_at).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </span>
                  </div>

                  {/* Number & Title */}
                  <div className="mb-2">
                    <p className="mb-0.5 font-mono text-[11px] font-semibold text-primary">{s.no_surat || 'Nomor diproses'}</p>
                    <h4 className={cn(
                      "line-clamp-2 text-sm font-semibold leading-snug transition-colors",
                      isActive ? "text-primary" : "text-sidebar-foreground"
                    )}>
                      {s.judul_surat}
                    </h4>
                  </div>

                  {/* Attachments indicator */}
                  {attachments.length > 0 && (
                    <div className="flex items-center gap-1.5 mb-2">
                      <Paperclip size={11} className="text-sidebar-foreground/45" />
                      <span className="text-[11px] font-medium text-sidebar-foreground/45">
                        {attachments.length} lampiran
                      </span>
                    </div>
                  )}

                  {/* Current Position */}
                  <div className="flex items-center gap-2 text-xs">
                    <Clock size={12} className="text-sidebar-foreground/45" />
                    <span className="text-sidebar-foreground/45">Posisi:</span>
                    <span className={cn(
                      "font-bold",
                      s.status === 'SELESAI' ? "text-emerald-400" : "text-blue-400"
                    )}>
                      {s.status === 'SELESAI' ? 'Selesai TTD' : getStepLabel(s)}
                    </span>
                  </div>

                  {/* Signature Progress - Shown when active */}
                  {isActive && s.surat_signatures && s.surat_signatures.length > 0 && (
                    <div className="mt-4 border-t border-sidebar-border pt-4">
                      <p className="mb-3 text-xs font-semibold text-sidebar-foreground/55">
                        Progress Tanda Tangan
                      </p>
                      <div className="space-y-2">
                        {s.surat_signatures
                          .sort((a, b) => a.step_order - b.step_order)
                          .map((sig) => (
                            <div key={sig.id} className="flex items-center gap-2.5">
                              <div className={cn(
                                "flex h-4 w-4 shrink-0 items-center justify-center rounded-full",
                                sig.is_signed ? "bg-emerald-500/20 text-emerald-400" : "bg-sidebar-foreground/10 text-sidebar-foreground/35"
                              )}>
                                {sig.is_signed ? <CheckCircle2 size={10} /> : <Clock size={10} />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={cn(
                                  "truncate text-xs font-medium",
                                  sig.is_signed ? "text-sidebar-foreground/75" : "text-sidebar-foreground/35"
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
