import {cleanup,render,screen,waitFor,fireEvent} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {MemoryRouter} from 'react-router';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import NotificationOpenPage from '@/pages/notifications/NotificationOpenPage';
const h=vi.hoisted(()=>({navigate:vi.fn(),getUser:vi.fn(),select:vi.fn(),update:vi.fn(),eq:vi.fn(),detail:vi.fn()}));
vi.mock('react-router',async original=>({...await original<typeof import('react-router')>(),useNavigate:()=>h.navigate}));
vi.mock('@/features/surat/inbox/services/surat-inbox-api',()=>({suratInboxApi:{getMyInboxDetail:h.detail}}));
vi.mock('@/lib/supabase',()=>({supabase:{auth:{getUser:h.getUser},from:()=>({select:()=>({eq:(...args:unknown[])=>{h.eq(...args);return {eq:(...values:unknown[])=>{h.eq(...values);return {maybeSingle:h.select};}}}}),update:h.update})}}));
const user='00000000-0000-4000-8000-000000000001',note='00000000-0000-4000-8000-000000000002',signature='00000000-0000-4000-8000-000000000003',surat='00000000-0000-4000-8000-000000000004';
const clients:QueryClient[]=[];
const mount=(id=note)=>{const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client);return render(<QueryClientProvider client={client}><MemoryRouter initialEntries={[`/notifications/open?id=${id}`]}><NotificationOpenPage/></MemoryRouter></QueryClientProvider>);};
beforeEach(()=>{
 vi.clearAllMocks();h.getUser.mockResolvedValue({data:{user:{id:user}}});
 h.select.mockResolvedValue({data:{id:note,user_id:user,data:{signature_id:signature,surat_id:surat}}});
 h.detail.mockResolvedValue({id:signature,user_id:user});h.update.mockReturnValue({eq:()=>({eq:async()=>({error:null})})});
});
afterEach(()=>{cleanup();for(const client of clients.splice(0))client.clear();});
describe('owned notification landing',()=>{
 it('resolves a canonical task through the protected detail API and marks only the owned notification read',async()=>{
  mount();await waitFor(()=>expect(h.navigate).toHaveBeenCalledWith(`/surat/inbox?task=${encodeURIComponent(`approval:${signature}`)}&document=${surat}`,{replace:true}));
  expect(h.eq).toHaveBeenCalledWith('user_id',user);expect(h.detail).toHaveBeenCalledWith(signature);expect(h.update).toHaveBeenCalledWith(expect.objectContaining({is_read:true}));
 });
 it('never opens the inbox or reads a foreign/deleted notification',async()=>{
  h.select.mockResolvedValue({data:null});mount();expect(await screen.findByText('Notifikasi tidak tersedia')).toBeInTheDocument();
  expect(h.navigate).not.toHaveBeenCalled();expect(h.update).not.toHaveBeenCalled();
 });
 it('does not query invalid IDs and does not lose offline errors as a false success',async()=>{
  const view=mount('invalid');expect(await screen.findByText('Notifikasi tidak tersedia')).toBeInTheDocument();expect(h.getUser).not.toHaveBeenCalled();view.unmount();
  h.detail.mockRejectedValueOnce(Error('Network offline'));mount();fireEvent.click(await screen.findByRole('button',{name:'Coba lagi'}));
  await waitFor(()=>expect(h.navigate).toHaveBeenCalled());
 });
 it('stale tasks return to the known document without claiming a different task',async()=>{
  h.detail.mockRejectedValue(Error('Task tidak aktif'));mount();await waitFor(()=>expect(h.navigate).toHaveBeenCalledWith(`/surat/monitoring?document=${surat}`,{replace:true}));
 });
});
