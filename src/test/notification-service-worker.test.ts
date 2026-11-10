import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {describe,expect,it,vi} from 'vitest';
const source=readFileSync('public/sigap-sw.js','utf8');
function boot() {
 const handlers:Record<string,(event:any)=>void>={};
 const clients={claim:vi.fn(async()=>undefined),matchAll:vi.fn(async()=>[] as any[]),openWindow:vi.fn(async()=>undefined)};
 const self={addEventListener:(name:string,fn:(event:any)=>void)=>{handlers[name]=fn;},skipWaiting:vi.fn(async()=>undefined),location:{origin:'https://sigap.test'},registration:{showNotification:vi.fn(async()=>undefined)}};
 runInNewContext(source,{self,clients,URL});
 return {self,clients,fire:async(name:string,event:Record<string,unknown>={})=>{let done:Promise<unknown>|undefined;handlers[name]({...event,waitUntil:(value:Promise<unknown>)=>{done=value;}});await done;}};
}
describe('browser popup service worker',()=>{
 it.each(['/status-pengajuan','/surat/monitoring'])('opens same-origin %s links without losing document filters',async(path)=>{
  const h=boot();
  await h.fire('notificationclick',{notification:{close:vi.fn(),data:{link:`${path}?document=fixture&status=DONE#approval`}}});
  expect(h.clients.openWindow).toHaveBeenCalledWith(`https://sigap.test${path}?document=fixture&status=DONE#approval`);
 });
 it('activates without caching personalized requests and handles background push with a stable tag',async()=>{
  const h=boot();await h.fire('install');await h.fire('activate');
  expect(h.self.skipWaiting).toHaveBeenCalled();expect(h.clients.claim).toHaveBeenCalled();
  await h.fire('push',{data:{json:()=>({title:'SIGAP',message:'Periksa',tag:'sigap:one',link:'/notifications/open?id=one'})}});
  expect(h.self.registration.showNotification).toHaveBeenCalledWith('SIGAP',expect.objectContaining({tag:'sigap:one',renotify:false,data:{link:'/notifications/open?id=one'}}));
 });
 it('handles invalid push JSON and never opens an external or unapproved URL',async()=>{
  const h=boot();await h.fire('push',{data:{json:()=>{throw Error('invalid');}}});
  expect(h.self.registration.showNotification).toHaveBeenCalledWith('Marison - SIGAP',expect.anything());
  for(const link of ['https://attacker.example','//evil.test','javascript:alert(1)','/admin/users']) {
   await h.fire('notificationclick',{notification:{close:vi.fn(),data:{link}}});
   expect(h.clients.openWindow).toHaveBeenLastCalledWith('https://sigap.test/dashboard');
  }
 });
 it('navigates and focuses an existing tab instead of spawning another',async()=>{
  const h=boot(),navigate=vi.fn(async()=>undefined),focus=vi.fn(async()=>undefined);h.clients.matchAll.mockResolvedValue([{navigate,focus}]);
  await h.fire('notificationclick',{notification:{close:vi.fn(),data:{link:'/notifications/open?id=fixture'}}});
  expect(navigate).toHaveBeenCalledWith('https://sigap.test/notifications/open?id=fixture');expect(focus).toHaveBeenCalled();expect(h.clients.openWindow).not.toHaveBeenCalled();
 });
});
