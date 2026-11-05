import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {DepartmentReceivingPolicy} from '@/components/configuration/DepartmentReceivingPolicy';
import {defaultReceivingRule,validateReceivingRule} from '@/services/department-receiving.service';
const h=vi.hoisted(()=>({list:vi.fn(),save:vi.fn(),remove:vi.fn(),confirm:vi.fn()}));
vi.mock('@/services/department-receiving.service',async original=>({...await original<typeof import('@/services/department-receiving.service')>(),departmentReceivingService:{list:h.list,save:h.save,remove:h.remove}}));
vi.mock('@/components/app/AppDialogProvider',()=>({useAppDialog:()=>({confirm:h.confirm})}));
vi.mock('@/lib/supabase',()=>({supabase:{}}));
const clients:QueryClient[]=[];
const mount=()=>{const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client);return render(<QueryClientProvider client={client}><DepartmentReceivingPolicy deptId="finance"/></QueryClientProvider>);};
beforeEach(()=>{vi.clearAllMocks();h.list.mockResolvedValue([]);h.save.mockResolvedValue(undefined);h.remove.mockResolvedValue(undefined);h.confirm.mockResolvedValue(true);});
afterEach(()=>{cleanup();for(const client of clients.splice(0))client.clear();});
describe('monthly department receiving configuration',()=>{
 it('keeps regular and month-specific rules distinct and does not silently enable a cutoff',async()=>{
  mount();const save=screen.getByRole('button',{name:'Simpan periode'});await waitFor(()=>expect(save).toBeEnabled());
  expect(screen.getByRole('switch',{name:'Gunakan batas penerimaan'})).not.toBeChecked();
  fireEvent.click(save);await waitFor(()=>expect(h.save).toHaveBeenCalledWith(expect.objectContaining({dept_id:'finance',period_month:'2000-01-01',enabled:false,cutoff_day:null})));
  fireEvent.mouseDown(screen.getByRole('tab',{name:'Bulan tertentu'}),{button:0,ctrlKey:false});
  const month=await screen.findByLabelText('Bulan pengecualian');fireEvent.change(month,{target:{value:'2026-12'}});
  fireEvent.click(screen.getByRole('switch',{name:'Gunakan batas penerimaan'}));fireEvent.change(screen.getByLabelText('Tanggal tutup tiap bulan'),{target:{value:'23'}});
  fireEvent.click(save);await waitFor(()=>expect(h.save).toHaveBeenLastCalledWith(expect.objectContaining({period_month:'2026-12-01',enabled:true,cutoff_day:23})));
 });
 it('requires confirmation before removing an exception and leaves data unchanged on cancel',async()=>{
  const month=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Jakarta',year:'numeric',month:'2-digit',day:'2-digit'}).slice(0,7);
  h.list.mockResolvedValue([{...defaultReceivingRule,dept_id:'finance',period_month:`${month}-01`}]);mount();
  fireEvent.mouseDown(screen.getByRole('tab',{name:'Bulan tertentu'}),{button:0,ctrlKey:false});
  const remove=await screen.findByRole('button',{name:'Hapus pengecualian'});h.confirm.mockResolvedValueOnce(false);fireEvent.click(remove);
  await waitFor(()=>expect(h.confirm).toHaveBeenCalled());expect(h.remove).not.toHaveBeenCalled();
  fireEvent.click(remove);await waitFor(()=>expect(h.remove).toHaveBeenCalledWith('finance',`${month}-01`));
 });
 it('rejects invalid dates, reversed windows and invalid SLA values',()=>{
  const rule={...defaultReceivingRule,dept_id:'finance',period_month:'2026-11-01'};
  expect(validateReceivingRule(rule)).toEqual(rule);
  for(const patch of [{cutoff_day:32},{reopen_day:29},{cutoff_day:1,reopen_day:2},{cutoff_day:1,reopen_day:1,cutoff_time:'07:00'},{sla_minutes:0},{period_month:'2026-11-15'},{cutoff_time:'99:00'},{message:'x'.repeat(301)}])expect(()=>validateReceivingRule({...rule,...patch})).toThrow();
 });
 it('reports a failed save without declaring success',async()=>{
  h.save.mockRejectedValue(Error('Permintaan ditolak'));mount();const save=screen.getByRole('button',{name:'Simpan periode'});await waitFor(()=>expect(save).toBeEnabled());fireEvent.click(save);
  expect(await screen.findByText('Permintaan ditolak')).toBeInTheDocument();expect(screen.queryByText(/Aturan penerimaan tersimpan/)).not.toBeInTheDocument();
 });
});
