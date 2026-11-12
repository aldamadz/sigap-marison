import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {NotificationPreferences} from '@/components/settings/NotificationPreferences';
const h=vi.hoisted(()=>({read:vi.fn(),save:vi.fn(),subscribe:vi.fn(),status:vi.fn(),eq:vi.fn()}));
vi.mock('@/services/push.service',()=>({pushService:{ensureSubscription:h.subscribe,getSubscriptionStatus:h.status}}));
vi.mock('@/lib/supabase',()=>({supabase:{from:()=>({select:()=>({eq:(...args:unknown[])=>{h.eq(...args);return {maybeSingle:h.read};}}),upsert:h.save})}}));
const clients:QueryClient[]=[];
const mount=()=>{const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client);render(<QueryClientProvider client={client}><NotificationPreferences userId="own-user"/></QueryClientProvider>);};
beforeEach(()=>{vi.clearAllMocks();h.status.mockResolvedValue({enabled:false,reason:'not_subscribed'});h.read.mockResolvedValue({data:null,error:null});h.save.mockResolvedValue({error:null});h.subscribe.mockResolvedValue({enabled:true});});
afterEach(()=>{cleanup();for(const client of clients.splice(0))client.clear();});
describe('self-service notification settings',()=>{
 it('does not enable automatic reminders or prompt without explicit activation',async()=>{
  mount();await screen.findByRole('button',{name:'Aktifkan notifikasi browser'});
  expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  expect(h.read).not.toHaveBeenCalled();expect(h.save).not.toHaveBeenCalled();expect(h.subscribe).not.toHaveBeenCalled();
  fireEvent.click(await screen.findByRole('button',{name:'Aktifkan notifikasi browser'}));
  await waitFor(()=>expect(h.subscribe).toHaveBeenCalledWith({requestPermission:true}));expect(await screen.findByText('Notifikasi browser aktif')).toBeInTheDocument();
 });
 it('does not write legacy global preferences and reports denied browser permission',async()=>{
  h.subscribe.mockResolvedValue({enabled:false,reason:'permission_not_granted'});mount();
  fireEvent.click(await screen.findByRole('button',{name:'Aktifkan notifikasi browser'}));expect(await screen.findByText('Izin notifikasi browser belum diberikan.')).toBeInTheDocument();
  expect(h.save).not.toHaveBeenCalled();
 });
 it.each([
  ['worker_not_ready','Layanan notifikasi browser belum siap. Muat ulang halaman, lalu coba lagi.'],
  ['provider_unavailable','Layanan push browser tidak dapat dihubungi. Coba melalui Chrome atau Edge, lalu periksa koneksi Anda.'],
 ])('explains %s without presenting activation as successful',async(reason,message)=>{
  h.subscribe.mockResolvedValue({enabled:false,reason});mount();
  fireEvent.click(await screen.findByRole('button',{name:'Aktifkan notifikasi browser'}));
  expect(await screen.findByText(message)).toBeInTheDocument();
  expect(screen.queryByText('Notifikasi browser aktif')).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Aktifkan notifikasi browser'})).toBeEnabled();
 });
 it.each([
  ['register','TypeError'],['ready','SecurityError'],['lookup','InvalidStateError'],
  ['subscribe','NotAllowedError'],['subscribe','InvalidStateError'],
 ])('shows sanitized %s / %s activation details',async(stage,code)=>{
  h.subscribe.mockResolvedValue({enabled:false,reason:'activation_failed',details:{stage,code}});mount();
  fireEvent.click(await screen.findByRole('button',{name:'Aktifkan notifikasi browser'}));
  const status=await screen.findByRole('status');
  expect(status).toHaveTextContent(`Tahap: ${stage}; kode: ${code}.`);
  expect(screen.queryByText('Notifikasi browser aktif')).not.toBeInTheDocument();
  expect(screen.getByRole('button',{name:'Aktifkan notifikasi browser'})).toBeEnabled();
 });
 it.each([400,401,403,500])('shows safe persistence HTTP %s and correlation ID, then clears them on retry',async(httpStatus)=>{
  h.subscribe.mockResolvedValueOnce({enabled:false,reason:'activation_failed',details:{stage:'persist',code:'HttpError',httpStatus,requestId:'push_req-1234'}})
   .mockResolvedValueOnce({enabled:true});mount();
  fireEvent.click(await screen.findByRole('button',{name:'Aktifkan notifikasi browser'}));
  expect(await screen.findByRole('status')).toHaveTextContent(`Tahap: persist; kode: HttpError; HTTP: ${httpStatus}; ID: push_req-1234.`);
  fireEvent.click(screen.getByRole('button',{name:'Aktifkan notifikasi browser'}));
  expect(await screen.findByText('Notifikasi browser aktif')).toBeInTheDocument();
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
 });
 it('preserves the provider-unavailable message alongside safe details',async()=>{
  h.subscribe.mockResolvedValue({enabled:false,reason:'provider_unavailable',details:{stage:'subscribe',code:'AbortError'}});mount();
  fireEvent.click(await screen.findByRole('button',{name:'Aktifkan notifikasi browser'}));
  expect(await screen.findByRole('status')).toHaveTextContent('Layanan push browser tidak dapat dihubungi.');
  expect(screen.getByRole('status')).toHaveTextContent('Tahap: subscribe; kode: AbortError.');
 });
 it('never displays a raw unexpected exception',async()=>{
  h.subscribe.mockRejectedValue(new Error('https://private.invalid/endpoint?key=private'));mount();
  fireEvent.click(await screen.findByRole('button',{name:'Aktifkan notifikasi browser'}));
  expect(await screen.findByRole('status')).toHaveTextContent('Notifikasi browser belum dapat diaktifkan. Coba lagi.');
  expect(screen.getByRole('status')).not.toHaveTextContent(/private|endpoint|key=/);
  expect(screen.getByRole('button',{name:'Aktifkan notifikasi browser'})).toBeEnabled();
 });
});
