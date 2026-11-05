import {describe,expect,it,vi} from 'vitest';
import {notificationOpenPath,notificationReturnPath,notificationTask,resolveNotificationTarget,safeNotificationLink} from '@/lib/notification-target';
const user='00000000-0000-4000-8000-000000000001',signature='00000000-0000-4000-8000-000000000002',surat='00000000-0000-4000-8000-000000000003';
const note={id:surat,user_id:user,link:`/surat/inbox?task=${signature}`,data:{surat_id:surat,signature_id:signature}};
describe('canonical notification destinations',()=>{
 it('retains only a validated notification route after login, with no external redirect',()=>{
  expect(notificationReturnPath(notificationOpenPath(surat))).toBe(notificationOpenPath(surat));
  for(const value of ['https://evil.example','//evil.example','/notifications/open?id=x','/dashboard?next=//evil.example',null])expect(notificationReturnPath(value)).toBe('/dashboard');
  for(const value of ['https://evil.example','//evil.example','/\\evil.example','javascript:alert(1)'])expect(safeNotificationLink(value)).toBeNull();
 });
 it('uses active canonical verification rather than another task or legacy signer default',async()=>{
  const detail={id:signature,user_id:user,verification_required:true,verification_status:'pending',verifier_snapshot:[{user_id:user}]};
  expect(await resolveNotificationTarget(note,async()=>detail)).toBe(`/surat/inbox?task=${encodeURIComponent(`verification:${signature}`)}&document=${surat}`);
  expect(notificationTask(detail,user,'approval')?.task_type).toBe('approval');
  expect(notificationTask({...detail,verification_status:'verified'},user,'verification')).toBeNull();
  expect(notificationTask({...detail,user_id:'other',verifier_snapshot:[]},user)).toBeNull();
 });
 it('stale/foreign tasks open document status, never the first unrelated inbox item',async()=>{
  expect(await resolveNotificationTarget(note,async()=>{throw Error('Task tidak aktif atau tidak ditemukan untuk user ini');})).toBe(`/surat/monitoring?document=${surat}`);
  expect(await resolveNotificationTarget({...note,data:{}},async()=>{throw Error('Task tidak aktif');})).toBeNull();
  await expect(resolveNotificationTarget(note,async()=>{throw Error('Network offline');})).rejects.toThrow('Network offline');
 });
 it('routes revision, recommendation, calendar and team notifications without claiming or changing tasks',async()=>{
  const getDetail=vi.fn();
  expect(await resolveNotificationTarget({...note,link:'/surat/tindak-lanjut',data:{surat_id:surat}},getDetail)).toBe(`/surat/tindak-lanjut?surat=${surat}`);
  expect(await resolveNotificationTarget({...note,link:`/surat/rekomendasi?task=${signature}`,data:{}},getDetail)).toBe(`/surat/rekomendasi?task=${signature}`);
  expect(await resolveNotificationTarget({...note,link:`/calendar?date=2026-11-05&entry=${signature}`,data:{}},getDetail)).toBe(`/calendar?date=2026-11-05&view=day&entry=${signature}`);
  expect(await resolveNotificationTarget({...note,data:{category:'team_digest'}},getDetail)).toBe('/dashboard?scope=team');
  expect(getDetail).not.toHaveBeenCalled();
 });
});
