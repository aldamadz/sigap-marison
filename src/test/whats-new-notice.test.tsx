import { fireEvent, render, screen, cleanup, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WhatsNewNotice, releaseIsCurrent, releaseSessionKey } from '@/components/app/WhatsNewNotice';
import type { ReleaseNotice } from '@/services/maintenance.service';

const mocks=vi.hoisted(()=>({read:vi.fn(),dismiss:vi.fn()}));
vi.mock('@/lib/supabase',()=>({supabase:{
  from:()=>({select:()=>({eq:()=>({maybeSingle:mocks.read})})}),rpc:mocks.dismiss,
}}));
const now=Date.parse('2026-11-05T15:00:00+07:00');
const release:ReleaseNotice={id:'00000000-0000-4000-8000-000000000001',completedAt:'2026-11-05T14:00:00+07:00',expiresAt:'2026-11-06T00:00:00+07:00',items:['Perbaikan: Tujuan notifikasi','Penambahan fitur: Kalender tim']};
const mount=(userId='user-a',notice=release,time=now)=>render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}})}><WhatsNewNotice userId={userId} release={notice} now={time} /></QueryClientProvider>);
beforeEach(()=>{sessionStorage.clear();mocks.read.mockResolvedValue({data:null,error:null});mocks.dismiss.mockResolvedValue({error:null});});
afterEach(()=>{cleanup();vi.clearAllMocks();});
describe("What's New release notice",()=>{
  it('expires at exact next midnight WIB, not after24hours or browser midnight',()=>{
    expect(releaseIsCurrent(release,Date.parse('2026-11-05T16:59:59Z'))).toBe(true);
    expect(releaseIsCurrent(release,Date.parse('2026-11-05T17:00:00Z'))).toBe(false);
    expect(releaseIsCurrent(release,Date.parse('2026-11-05T06:59:59Z'))).toBe(false);
  });
  it('uses standalone publication time without requiring maintenance completion',()=>{
    const {completedAt,...standalone}=release;
    expect(releaseIsCurrent({...standalone,publishedAt:completedAt},now)).toBe(true);
    expect(releaseIsCurrent({...standalone,publishedAt:'invalid'},now)).toBe(false);
  });
  it('renders safe text and allows session dismissal separately from permanent opt-out',async()=>{
    const notice={...release,items:['<img src=x onerror=alert(1)>']};
    const view=mount('user-a',notice);await screen.findByRole('dialog');
    expect(screen.getByText(notice.items[0])).toBeInTheDocument();expect(document.querySelector('img')).toBeNull();
    fireEvent.click(screen.getByRole('button',{name:'Mengerti'}));expect(screen.queryByRole('dialog')).toBeNull();
    expect(sessionStorage.getItem(releaseSessionKey('user-a',release.id))).toBe('1');expect(mocks.dismiss).not.toHaveBeenCalled();
    view.unmount();const again=mount();expect(screen.queryByRole('dialog')).toBeNull();again.unmount();
    mount('user-b');expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
  it('stores explicit opt-out for the authenticated account with no arbitrary actor argument',async()=>{
    mount();await screen.findByRole('dialog');fireEvent.click(screen.getByRole('button',{name:'Jangan tampilkan lagi'}));
    await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
    expect(mocks.dismiss).toHaveBeenCalledWith('dismiss_release_notice',{p_release_id:release.id});
  });
  it('honors existing account dismissal but not another release',async()=>{
    mocks.read.mockResolvedValue({data:{dismissed_release_id:release.id},error:null});
    const first=mount();await waitFor(()=>expect(mocks.read).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).toBeNull();first.unmount();
    mount('user-a',{...release,id:'00000000-0000-4000-8000-000000000002'});expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
  it('failed opt-out remains visible and does not falsely record session dismissal',async()=>{
    mocks.dismiss.mockResolvedValue({error:new Error('offline')});mount();await screen.findByRole('dialog');
    fireEvent.click(screen.getByRole('button',{name:'Jangan tampilkan lagi'}));await screen.findByRole('alert');
    expect(screen.getByRole('dialog')).toBeInTheDocument();expect(sessionStorage.length).toBe(0);
  });
  it('does not show expired or empty notices',()=>{
    const first=mount('user-a',release,Date.parse(release.expiresAt));expect(screen.queryByRole('dialog')).toBeNull();first.unmount();
    mount('user-a',{...release,items:[]});expect(screen.queryByRole('dialog')).toBeNull();
  });
});
