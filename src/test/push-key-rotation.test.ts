import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { pushService } from '@/services/push.service';
const h=vi.hoisted(()=>({key:vi.fn(),save:vi.fn(),remove:vi.fn()}));
vi.mock('@/services/attention.service',async original=>({
 ...await original<typeof import('@/services/attention.service')>(),
 attentionService:{getPushPublicKey:h.key,savePushSubscription:h.save,removePushSubscription:h.remove},
}));
const lookup=vi.fn(),subscribe=vi.fn(),unsubscribe=vi.fn(),register=vi.fn(),getRegistration=vi.fn(),permission=vi.fn();
const key=new Uint8Array([4,1,2,3]);
const current={endpoint:'https://fcm.googleapis.com/current',options:{applicationServerKey:key.buffer},unsubscribe};
const old={endpoint:'https://fcm.googleapis.com/old',options:{applicationServerKey:new Uint8Array([4,4,5,6]).buffer},unsubscribe};
const registration={active:{},pushManager:{getSubscription:lookup,subscribe}};
beforeEach(()=>{
 vi.clearAllMocks();h.key.mockResolvedValue({enabled:true,publicKey:'BAECAw'});h.save.mockResolvedValue({ok:true});h.remove.mockResolvedValue({ok:true});
 lookup.mockResolvedValue(null);subscribe.mockResolvedValue(current);unsubscribe.mockResolvedValue(true);
 register.mockResolvedValue(registration);getRegistration.mockResolvedValue(registration);
 vi.stubGlobal('PushManager',function(){});vi.stubGlobal('Notification',{permission:'granted',requestPermission:permission});
 vi.stubGlobal('navigator',{serviceWorker:{register,getRegistration,ready:Promise.resolve(registration)}});
});
afterEach(()=>vi.unstubAllGlobals());
describe('push application server key changes',()=>{
 it('does not report or persist an obsolete subscription as active during a status check',async()=>{
  lookup.mockResolvedValue(old);
  await expect(pushService.getSubscriptionStatus()).resolves.toEqual({enabled:false,reason:'subscription_outdated'});
  expect(h.save).not.toHaveBeenCalled();expect(unsubscribe).not.toHaveBeenCalled();expect(permission).not.toHaveBeenCalled();
 });
 it('retains a matching subscription during status checks',async()=>{
  lookup.mockResolvedValue(current);
  await expect(pushService.getSubscriptionStatus()).resolves.toEqual({enabled:true});
  expect(h.save).toHaveBeenCalledWith(current);expect(unsubscribe).not.toHaveBeenCalled();
 });
 it('retires only the obsolete endpoint and replaces it with a current-key subscription',async()=>{
  lookup.mockResolvedValueOnce(old).mockResolvedValue(null);
  await expect(pushService.ensureSubscription()).resolves.toEqual({enabled:true});
  expect(h.remove).toHaveBeenCalledExactlyOnceWith(old.endpoint);expect(unsubscribe).toHaveBeenCalledTimes(1);
  expect(subscribe).toHaveBeenCalledExactlyOnceWith({userVisibleOnly:true,applicationServerKey:key});
  expect(h.save).toHaveBeenCalledExactlyOnceWith(current);expect(permission).not.toHaveBeenCalled();
 });
 it('does not replace a subscription whose key matches',async()=>{
  lookup.mockResolvedValue(current);
  await expect(pushService.ensureSubscription()).resolves.toEqual({enabled:true});
  expect(subscribe).not.toHaveBeenCalled();expect(unsubscribe).not.toHaveBeenCalled();expect(h.remove).not.toHaveBeenCalled();
 });
 it('treats missing key metadata as unverified rather than active',async()=>{
  lookup.mockResolvedValue({...old,options:{applicationServerKey:null}});
  await expect(pushService.getSubscriptionStatus()).resolves.toEqual({enabled:false,reason:'subscription_outdated'});
 });
 it('never returns success when the old browser registration remains after unsubscribe',async()=>{
  lookup.mockResolvedValue(old);unsubscribe.mockResolvedValue(false);
  await expect(pushService.ensureSubscription()).resolves.toMatchObject({enabled:false,details:{stage:'unsubscribe'}});
  expect(subscribe).not.toHaveBeenCalled();expect(h.save).not.toHaveBeenCalled();
 });
 it('handles another tab finishing replacement without creating a second subscription',async()=>{
  lookup.mockResolvedValueOnce(old).mockResolvedValue(current);unsubscribe.mockResolvedValue(false);
  await expect(pushService.ensureSubscription()).resolves.toEqual({enabled:true});
  expect(subscribe).not.toHaveBeenCalled();expect(h.save).toHaveBeenCalledExactlyOnceWith(current);
 });
 it('single-flights concurrent activations',async()=>{
  lookup.mockResolvedValueOnce(old).mockResolvedValue(null);
  const result=await Promise.all([pushService.ensureSubscription(),pushService.ensureSubscription()]);
  expect(result).toEqual([{enabled:true},{enabled:true}]);expect(subscribe).toHaveBeenCalledTimes(1);expect(h.save).toHaveBeenCalledTimes(1);
 });
 it('uses an origin-scoped Web Lock when available',async()=>{
  const request=vi.fn(async(_name,_options,action)=>action());
  Object.defineProperty(navigator,'locks',{value:{request},configurable:true});
  await expect(pushService.ensureSubscription()).resolves.toEqual({enabled:true});
  expect(request).toHaveBeenCalledWith('sigap-push-subscription',expect.objectContaining({signal:expect.any(AbortSignal)}),expect.any(Function));
 });
 it('keeps a read-only status check from racing a replacement in this tab',async()=>{
  let release!: (value: {ok:boolean})=>void;
  h.remove.mockImplementationOnce(()=>new Promise(resolve=>{release=resolve;}));
  lookup.mockResolvedValueOnce(old).mockResolvedValue(null);
  const activating=pushService.ensureSubscription();
  await vi.waitFor(()=>expect(h.remove).toHaveBeenCalled());
  const checking=pushService.getSubscriptionStatus();
  expect(lookup).toHaveBeenCalledTimes(1);
  release({ok:true});
  await expect(activating).resolves.toEqual({enabled:true});await expect(checking).resolves.toEqual({enabled:true});
  expect(h.save).toHaveBeenCalledExactlyOnceWith(current);
 });
 it('does not touch registrations without granted permission',async()=>{
  vi.stubGlobal('Notification',{permission:'default',requestPermission:permission});lookup.mockResolvedValue(old);
  await expect(pushService.ensureSubscription()).resolves.toMatchObject({enabled:false,reason:'permission_not_granted'});
  expect(lookup).not.toHaveBeenCalled();expect(h.remove).not.toHaveBeenCalled();expect(unsubscribe).not.toHaveBeenCalled();
 });
 it('does not retire existing registrations if the server key cannot be decoded',async()=>{
  lookup.mockResolvedValue(old);h.key.mockResolvedValue({enabled:true,publicKey:'!invalid!'});
  await expect(pushService.ensureSubscription()).resolves.toMatchObject({enabled:false,details:{stage:'public_key'}});
  expect(h.remove).not.toHaveBeenCalled();expect(unsubscribe).not.toHaveBeenCalled();
 });
 it('does not persist a newly returned subscription with the wrong key',async()=>{
  subscribe.mockResolvedValue(old);
  await expect(pushService.ensureSubscription()).resolves.toMatchObject({enabled:false,details:{stage:'subscribe'}});
  expect(h.save).not.toHaveBeenCalled();
 });
 it('does not retire a browser subscription if the authenticated server retirement fails',async()=>{
  lookup.mockResolvedValue(old);h.remove.mockRejectedValue(Error('private endpoint details'));
  await expect(pushService.ensureSubscription()).resolves.toMatchObject({enabled:false,details:{stage:'unsubscribe'}});
  expect(unsubscribe).not.toHaveBeenCalled();expect(h.save).not.toHaveBeenCalled();
 });
});
