// src/components/agenda/agenda-parent-filter.tsx
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/use-auth';
import { getChildUsers, ChildUser } from '@/services/parent-user.service'; 
import { Users, Loader2, Building2, UserCircle, ChevronRight } from 'lucide-react';

interface AgendaParentFilterProps {
  onUserSelect: (userId: string | null) => void;
  selectedUserId: string | null;
  onOfficeSelect: (officeId: string | null) => void;
  selectedOfficeId: string | null;
}

export function AgendaParentFilter({ 
  onUserSelect, 
  selectedUserId, 
  onOfficeSelect, 
  selectedOfficeId 
}: AgendaParentFilterProps) {
  const { user } = useAuth() as any;

  const { data: offices = [] } = useQuery({
    queryKey: ['offices-list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('master_offices').select('id, name').order('name');
      if (error) throw error;
      return data;
    }
  });

  const { data: childUsers = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: ['visible-users-recursive', user?.id],
    queryFn: () => getChildUsers(user?.id),
    enabled: !!user?.id,
  });

  // PERBAIKAN: Grouping tetap menampilkan semua bawahan tanpa terpotong filter kantor di dalam dropdown
  const groupedByOffice = useMemo(() => {
    return childUsers.reduce((acc: Record<string, ChildUser[]>, curr: ChildUser) => {
      const officeInfo = offices.find(o => String(o.id) === String(curr.office_id));
      const officeName = officeInfo?.name || 'KANTOR CABANG';
      if (!acc[officeName]) acc[officeName] = [];
      acc[officeName].push(curr);
      return acc;
    }, {});
  }, [childUsers, offices]);

  const getInitials = (name: string) => {
    if (!name) return '??';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const selectedChild = childUsers.find((u: any) => String(u.id) === String(selectedUserId));
  const isMeSelected = String(selectedUserId) === String(user?.id);

  const currentOfficeLabel = useMemo(() => {
    if (!selectedOfficeId || selectedOfficeId === 'all_offices') return "Seluruh Cabang";
    const found = offices.find((o: any) => String(o.id) === String(selectedOfficeId));
    return found ? found.name : "Area Kantor";
  }, [selectedOfficeId, offices]);

  return (
    <div className="flex flex-col sm:flex-row items-end gap-3 w-full">
      
      {/* FILTER 1: AREA KANTOR */}
      <div className="flex-1 w-full space-y-1.5">
        <Label className="text-[10px] font-black uppercase tracking-tighter text-muted-foreground flex items-center gap-1.5 ml-1">
          <Building2 className="h-3 w-3" /> Area Kantor
        </Label>
        <Select
          value={selectedOfficeId || "all_offices"} 
          onValueChange={(val) => {
            onOfficeSelect(val === 'all_offices' ? null : val);
            // PENTING: Jika pindah kantor, kembalikan ke "Semua Tim" agar tidak stuck di user kantor lama
            onUserSelect('all'); 
          }}
        >
          <SelectTrigger className="h-11 rounded-xl border-border/60 bg-background text-xs font-bold shadow-sm sm:h-9 sm:text-[11px]">
            <SelectValue>{currentOfficeLabel}</SelectValue>
          </SelectTrigger>
          <SelectContent className="rounded-xl shadow-xl">
            <SelectItem value="all_offices" className="min-h-11 text-xs font-medium text-primary sm:min-h-9 sm:text-[11px]">
              Seluruh Cabang (Semua Level)
            </SelectItem>
            {offices.map((off: any) => (
              <SelectItem key={off.id} value={String(off.id)} className="min-h-11 text-xs sm:min-h-9 sm:text-[11px]">
                {off.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* FILTER 2: ANGGOTA TIM */}
      <div className="flex-[1.5] w-full space-y-1.5">
        <Label className="text-[10px] font-black uppercase tracking-tighter text-muted-foreground flex items-center gap-1.5 ml-1">
          <Users className="h-3 w-3" /> Hirarki Anggota Tim
        </Label>
        <Select
          value={selectedUserId || 'all'}
          onValueChange={(value) => {
            onUserSelect(value);
            // PENTING: Jika memilih user perorangan, matikan filter kantor (set ke null)
            // Agar query di backend tidak memfilter kantor secara ganda
            if (value !== 'all' && value !== user?.id) {
               onOfficeSelect(null);
            }
          }}
          disabled={isLoadingUsers}
        >
          <SelectTrigger className="h-11 rounded-xl border-border/60 bg-background text-xs shadow-sm sm:h-9 sm:text-[11px]">
            <SelectValue>
              {isMeSelected ? (
                <span className="font-bold">Agenda Saya</span>
              ) : (selectedUserId === 'all' || !selectedUserId) ? (
                <span className="font-bold">Seluruh Anggota Tim</span>
              ) : (
                <span className="font-bold">{(selectedChild as any)?.full_name}</span>
              )}
            </SelectValue>
          </SelectTrigger>

          <SelectContent className="max-h-[400px] rounded-2xl shadow-xl">
            <SelectItem value={String(user?.id)} className="min-h-11 text-xs font-bold sm:min-h-9 sm:text-[11px]">Agenda Saya</SelectItem>
            <SelectItem value="all" className="min-h-11 text-xs font-bold text-primary sm:min-h-9 sm:text-[11px]">Seluruh Anggota Tim</SelectItem>
            
            <div className="h-px bg-border/50 my-1.5" />

            {isLoadingUsers ? (
              <Loader2 className="h-4 w-4 animate-spin mx-auto my-4" />
            ) : (
              Object.entries(groupedByOffice).map(([officeName, members]) => (
                <SelectGroup key={officeName}>
                  <SelectLabel className="px-2 py-1 text-[9px] font-black uppercase bg-muted/30">{officeName}</SelectLabel>
                  {members.map((child: any) => (
                    <SelectItem key={child.id} value={String(child.id)} className="min-h-11 pl-2 sm:min-h-9">
                      <div className="flex items-center gap-1">
                        {/* Garis hirarki agar Admin tahu Yatno di bawah Siti */}
                        {Array.from({ length: child.depth || 0 }).map((_, i) => (
                          <div key={i} className="w-2.5 border-l h-4 ml-1 border-primary/20" />
                        ))}
                        <Avatar className="h-5 w-5">
                          <AvatarImage src={child.avatar_url} />
                          <AvatarFallback className="text-[7px]">{getInitials(child.full_name)}</AvatarFallback>
                        </Avatar>
                        <span className="text-[11px] truncate">{child.full_name}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectGroup>
              ))
            )}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}