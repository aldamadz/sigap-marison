import { fireEvent, render, screen, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MaintenanceNotice } from '@/components/app/MaintenanceNotice';
import MaintenanceConfigurationPage from '@/pages/admin/MaintenanceConfigurationPage';
import { maintenanceDay, noticeDismissalKey, type MaintenanceState } from '@/services/maintenance.service';
const mocks=vi.hoisted(()=>({status:vi.fn(),admin:vi.fn(),update:vi.fn(),openPage:vi.fn()}));
vi.mock('@/services/maintenance.service',async original=>({...await original<typeof import('@/services/maintenance.service')>(),maintenanceService:mocks}));
vi.mock('sonner',()=>({toast:{success:vi.fn()}}));
const state:MaintenanceState={revision:1,phase:'announced',serverNow:new Date().toISOString(),schedule:{id:'s1',category:'update',impact:'disruption',message:'Pembaruan SIGAP; akses mungkin terganggu.',startsAt:new Date(Date.now()+3600000).toISOString(),endsAt:new Date(Date.now()+7200000).toISOString(),duration:1,unit:'hours',status:'published'}};
const mount=(userId='actor-1',path='/dashboard')=>render(<MemoryRouter initialEntries={[path]}><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}})}><MaintenanceNotice userId={userId} /></QueryClientProvider></MemoryRouter>);
beforeEach(()=>{mocks.status.mockResolvedValue(state);localStorage.clear();});
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();});
describe('maintenance advance notice',()=>{
  it('shows start/end in WIB and preserves access for disruption, closing is not persisted without checkbox',async()=>{
    const view=mount();await screen.findByRole('dialog');expect(screen.getByText(/SIGAP tetap dapat digunakan/)).toBeInTheDocument();
    expect(screen.getByText('Mulai')).toBeInTheDocument();expect(screen.getByText('Perkiraan selesai')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button',{name:'Mengerti'}));expect(screen.queryByRole('dialog')).not.toBeInTheDocument();expect(screen.getByRole('status')).toHaveTextContent('Potensi gangguan');
    expect(localStorage.length).toBe(0);view.unmount();mount();expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
  it('remembers opt-out for user/schedule/revision/WIB day; another user or revised schedule is reminded',async()=>{
    const view=mount();await screen.findByRole('dialog');fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button',{name:'Mengerti'}));
    expect(localStorage.getItem(noticeDismissalKey('actor-1',state,Date.now()))).toBe('1');view.unmount();
    const repeat=mount();await waitFor(()=>expect(mocks.status).toHaveBeenCalled());expect(screen.queryByRole('dialog')).not.toBeInTheDocument();repeat.unmount();
    const other=mount('actor-2');expect(await screen.findByRole('dialog')).toBeInTheDocument();other.unmount();
    mocks.status.mockResolvedValue({...state,revision:2});mount();expect(await screen.findByRole('dialog')).toBeInTheDocument();
  });
  it('daily opt-out ends exactly at midnight WIB, independent of browser timezone',()=>{
    const before=Date.parse('2026-10-19T16:59:59Z'),after=Date.parse('2026-10-19T17:00:00Z');
    expect(maintenanceDay(before)).toBe('2026-10-19');expect(maintenanceDay(after)).toBe('2026-10-20');
    expect(noticeDismissalKey('actor-1',state,before)).not.toBe(noticeDismissalKey('actor-1',state,after));
  });
  it('does not show cancelled, distant or expired disruption notices',async()=>{
    for(const change of [{status:'cancelled' as const},{startsAt:new Date(Date.now()+4*86400000).toISOString()},{endsAt:new Date(Date.now()-1000).toISOString()}]){
      mocks.status.mockResolvedValue({...state,schedule:{...state.schedule,...change}});const view=mount();await waitFor(()=>expect(mocks.status).toHaveBeenCalled());expect(screen.queryByRole('dialog')).not.toBeInTheDocument();view.unmount();
    }
  });
  it('daily suppression cannot bypass full maintenance; open dashboards navigate to the edge page without checking origin access',async()=>{
    const full={...state,phase:'maintenance',schedule:{...state.schedule!,impact:'full',startsAt:new Date(Date.now()-1000).toISOString()}};
    localStorage.setItem(noticeDismissalKey('actor-1',full as MaintenanceState,Date.now()),'1');mocks.status.mockResolvedValue(full);
    const fetch=vi.fn();vi.stubGlobal('fetch',fetch);mount();
    await waitFor(()=>expect(mocks.openPage).toHaveBeenCalledTimes(1));
    expect(fetch).not.toHaveBeenCalled();expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Membuka halaman pemeliharaan');
  });
  it.each(['/maintenance-admin','/admin/configuration/maintenance'])('retains the explicit administrator recovery route %s',async path=>{
    mocks.status.mockResolvedValue({...state,schedule:{...state.schedule!,impact:'full',startsAt:new Date(Date.now()-1000).toISOString()}});
    mount('admin-actor',path);await screen.findByRole('status');expect(mocks.openPage).not.toHaveBeenCalled();
  });
  it('does not navigate for a future full schedule or an active disruption',async()=>{
    for(const schedule of [{...state.schedule!,impact:'full' as const},{...state.schedule!,startsAt:new Date(Date.now()-1000).toISOString()}]) {
      mocks.status.mockResolvedValue({...state,schedule});const view=mount();await screen.findByRole('dialog');expect(mocks.openPage).not.toHaveBeenCalled();view.unmount();
    }
  });
  it('transitions an already mounted dashboard at the scheduled second without a new origin request',async()=>{
    const start=Date.now()+2000,serverNow=new Date().toISOString();
    mocks.status.mockResolvedValue({...state,serverNow,schedule:{...state.schedule!,impact:'full',startsAt:new Date(start).toISOString()}});
    mount();await screen.findByRole('dialog');expect(mocks.openPage).not.toHaveBeenCalled();
    await waitFor(()=>expect(mocks.openPage).toHaveBeenCalledTimes(1),{timeout:4000});
    expect(mocks.status).toHaveBeenCalledTimes(1);
  });
  it('admin settings require explicit confirmation before scheduling and keep failed save in dialog',async()=>{
    mocks.admin.mockResolvedValue({revision:3,schedule:null,history:[]});mocks.update.mockRejectedValue(new Error('Jadwal telah diubah admin lain.'));
    render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MaintenanceConfigurationPage /></QueryClientProvider>);
    await screen.findByText('Tidak ada maintenance terjadwal');fireEvent.click(screen.getByRole('button',{name:'Terbitkan jadwal'}));expect(mocks.update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button',{name:'Terbitkan'}));await screen.findByRole('alert');
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({action:'publish',expectedRevision:3,schedule:expect.objectContaining({impact:'disruption'})}));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });
  it('retains loaded non-default category and duration after native form synchronization',async()=>{
    mocks.admin.mockResolvedValue({revision:3,schedule:{...state.schedule,category:'repair',duration:10,unit:'minutes'},history:[]});
    render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><MaintenanceConfigurationPage /></QueryClientProvider>);
    await screen.findByText('Jadwal diterbitkan');
    const unit=screen.getByRole('combobox',{name:'Satuan durasi'}),category=screen.getByRole('combobox',{name:'Jenis kegiatan'});
    for(const select of document.querySelectorAll('form select'))fireEvent.change(select,{target:{value:''}});
    await waitFor(()=>expect(unit).toHaveTextContent('Menit'));
    expect(category).toHaveTextContent('Perbaikan');
    expect(screen.getByLabelText('Estimasi durasi')).toHaveValue(10);
  });
});
