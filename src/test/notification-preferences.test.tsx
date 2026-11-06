import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {NotificationPreferences} from '@/components/settings/NotificationPreferences';
const h=vi.hoisted(()=>({read:vi.fn(),save:vi.fn(),subscribe:vi.fn(),eq:vi.fn()}));
vi.mock('@/services/push.service',()=>({pushService:{ensureSubscription:h.subscribe}}));
vi.mock('@/lib/supabase',()=>({supabase:{from:()=>({select:()=>({eq:(...args:unknown[])=>{h.eq(...args);return {maybeSingle:h.read};}}),upsert:h.save})}}));
const clients:QueryClient[]=[];
const mount=()=>{const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client);render(<QueryClientProvider client={client}><NotificationPreferences userId="own-user"/></QueryClientProvider>);};
beforeEach(()=>{vi.clearAllMocks();h.read.mockResolvedValue({data:null,error:null});h.save.mockResolvedValue({error:null});h.subscribe.mockResolvedValue({enabled:true});});
afterEach(()=>{cleanup();for(const client of clients.splice(0))client.clear();});
describe('self-service notification settings',()=>{
 it('does not prompt automatically; team popups default off and save is scoped to the current account',async()=>{
  mount();const team=await screen.findByRole('switch',{name:'Popup browser untuk ringkasan tim'});await waitFor(()=>expect(team).toBeEnabled());
  expect(team).not.toBeChecked();expect(h.subscribe).not.toHaveBeenCalled();
  fireEvent.click(team);fireEvent.click(screen.getByRole('button',{name:'Simpan notifikasi'}));
  await waitFor(()=>expect(h.save).toHaveBeenCalledWith(expect.objectContaining({user_id:'own-user',team_push:true})));
  expect(h.eq).toHaveBeenCalledWith('user_id','own-user');
  fireEvent.click(screen.getByRole('button',{name:'Aktifkan notifikasi browser'}));
  await waitFor(()=>expect(h.subscribe).toHaveBeenCalledWith({requestPermission:true}));expect(await screen.findByText('Notifikasi browser aktif')).toBeInTheDocument();
 });
 it('keeps a failed preference save retryable and reports denied browser permission',async()=>{
  h.save.mockResolvedValue({error:Error('offline')});h.subscribe.mockResolvedValue({enabled:false,reason:'permission_not_granted'});mount();
  const save=await screen.findByRole('button',{name:'Simpan notifikasi'});await waitFor(()=>expect(save).toBeEnabled());fireEvent.click(save);
  expect(await screen.findByText('Pengaturan belum dapat disimpan. Coba lagi.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button',{name:'Aktifkan notifikasi browser'}));expect(await screen.findByText('Izin notifikasi browser belum diberikan.')).toBeInTheDocument();
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
});
