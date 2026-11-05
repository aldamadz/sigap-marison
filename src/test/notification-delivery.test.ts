import {describe,expect,it,vi} from 'vitest';
import {createNotificationDelivery,notificationAudience} from '../../backend/src/modules/attention/notification-delivery';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const row=(n=1)=>({id:id(n),lease_token:id(100+n),notification_id:id(200+n),endpoint:'https://fcm.googleapis.com/test',subscription:{endpoint:'https://fcm.googleapis.com/test'},category:null});
const deferred=()=>{let resolve!:()=>void;const promise=new Promise<void>(done=>{resolve=done;});return {promise,resolve};};
function setup(rows=[row()]) {
 let now=0;
 const rpc=vi.fn(async(name:string)=>({data:name==='generate_notification_reminders'?2:name==='claim_notification_push'?rows:true,error:null}));
 const send=vi.fn(async()=>undefined),configured=vi.fn(()=>true);
 const runtime=createNotificationDelivery({rpc,send,configured,now:()=>now},[id(999)]);
 return {rpc,send,configured,runtime,time:(value:number)=>{now=value;}};
}
describe('durable browser notification delivery',()=>{
 it('requires an explicit staging audience and validates bounded UUIDs',()=>{
  expect(()=>notificationAudience('', 'staging')).toThrow('explicitly');
  expect(notificationAudience(undefined,'production')).toBeNull();
  expect(notificationAudience(`${id(1)}, ${id(1)},${id(2)}`,'staging')).toEqual([id(1),id(2)]);
  expect(()=>notificationAudience('all','staging')).toThrow('Invalid');
  expect(()=>notificationAudience(Array.from({length:1001},(_,i)=>id(i)).join(','),'staging')).toThrow('Invalid');
 });
 it('plans at most once a minute, uses a bounded batch and generic lock-screen content',async()=>{
  const h=setup();await h.runtime.tick();await h.runtime.tick();
  expect(h.rpc.mock.calls.filter(call=>call[0]==='generate_notification_reminders')).toHaveLength(1);
  expect(h.rpc).toHaveBeenCalledWith('claim_notification_push',{p_limit:20,p_audience:[id(999)]});
  expect(h.send).toHaveBeenCalledWith(row().subscription,expect.objectContaining({link:`/notifications/open?id=${id(201)}`,tag:`sigap-notification:${id(201)}`}));
  expect(JSON.stringify(h.send.mock.calls)).not.toMatch(/amount|Private detail|surat_registrasi/);
  h.time(60000);await h.runtime.tick();expect(h.rpc.mock.calls.filter(call=>call[0]==='generate_notification_reminders')).toHaveLength(2);
 });
 it.each([[410,'failed','410'],[404,'failed','404'],[400,'failed','400'],[429,'retry','429'],[503,'retry','503'],[undefined,'retry','network_error']] as const)('acknowledges provider %s without recording raw error bodies',async(status,outcome,code)=>{
  const h=setup();h.send.mockRejectedValueOnce(Object.assign(Error('private endpoint/token'),{statusCode:status}));
  await h.runtime.tick();expect(h.rpc).toHaveBeenCalledWith('finish_notification_push',{p_id:id(1),p_lease_token:id(101),p_outcome:outcome,p_error_code:code});
  expect(JSON.stringify(h.rpc.mock.calls)).not.toContain('private endpoint');
 });
 it('does not claim without VAPID configuration and refuses mismatched or oversized batches',async()=>{
  const h=setup();h.configured.mockReturnValue(false);await h.runtime.tick();expect(h.rpc.mock.calls.some(call=>call[0]==='claim_notification_push')).toBe(false);
  const mismatch=setup([{...row(),endpoint:'https://attacker.example'}]);await mismatch.runtime.tick();expect(mismatch.send).not.toHaveBeenCalled();
  expect(mismatch.rpc).toHaveBeenCalledWith('finish_notification_push',expect.objectContaining({p_error_code:'invalid_endpoint',p_outcome:'failed'}));
  const large=setup(Array.from({length:21},(_,i)=>row(i)));await expect(large.runtime.tick()).rejects.toThrow('invalid_delivery_batch');expect(large.send).not.toHaveBeenCalled();
 });
 it('keeps the single-flight lock until all parallel senders settle, including a failed acknowledgement',async()=>{
  const h=setup([row(1),row(2)]),gate=deferred();
  h.send.mockImplementationOnce(async()=>undefined).mockImplementationOnce(()=>gate.promise);
  h.rpc.mockImplementation(async(name)=>({data:name==='claim_notification_push'?[row(1),row(2)]:0,error:name==='finish_notification_push'?Error('offline'):null}));
  const first=h.runtime.tick();await vi.waitFor(()=>expect(h.send).toHaveBeenCalledTimes(2));
  expect(await h.runtime.tick()).toEqual({skipped:true});
  gate.resolve();await expect(first).rejects.toThrow('notification_ack_failed');
 });
 it('caps concurrent providers at four and stops further claims after shutdown',async()=>{
  const h=setup(Array.from({length:10},(_,i)=>row(i))),gate=deferred();
  h.send.mockImplementation(()=>gate.promise);const first=h.runtime.tick();
  await vi.waitFor(()=>expect(h.send).toHaveBeenCalledTimes(4));h.runtime.stop();gate.resolve();await first;
  expect(h.send).toHaveBeenCalledTimes(4);expect(await h.runtime.tick()).toEqual({skipped:true});
 });
});
