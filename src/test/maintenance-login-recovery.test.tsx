import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, expect, it, vi } from 'vitest';
import LoginPage from '@/pages/auth/LoginPage';
const mocks=vi.hoisted(()=>({navigate:vi.fn(),login:vi.fn()}));
vi.mock('react-router',async original=>({...await original<typeof import('react-router')>(),useNavigate:()=>mocks.navigate}));
vi.mock('@/lib/supabase',()=>({supabase:{auth:{signInWithPassword:mocks.login},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{is_active:true}})})})})}}));
vi.mock('next-themes',()=>({useTheme:()=>({resolvedTheme:'light',setTheme:vi.fn()})}));
vi.mock('sonner',()=>({toast:{success:vi.fn(),error:vi.fn()}}));
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();history.replaceState(null,'','/');localStorage.clear();});
it('retains the admin recovery destination even if the auth transition changes pathname',async()=>{
 history.replaceState(null,'','/maintenance-admin');
 vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
 mocks.login.mockImplementation(async()=>{history.replaceState(null,'','/dashboard');return {data:{session:{user:{id:'admin'}}},error:null};});
 render(<MemoryRouter><LoginPage/></MemoryRouter>);
 fireEvent.change(screen.getByPlaceholderText('nama@perusahaan.com'),{target:{value:'admin@example.test'}});
 const password=screen.getByPlaceholderText('Masukkan password Anda');fireEvent.change(password,{target:{value:'test-only-fixture'}});
 fireEvent.submit(password.closest('form')!);
 await waitFor(()=>expect(mocks.navigate).toHaveBeenCalledWith('/admin/configuration/maintenance'));
});

it('returns to a validated notification after login and rejects arbitrary redirects',async()=>{
 vi.stubGlobal('ResizeObserver',class{observe(){}unobserve(){}disconnect(){}});
 const path='/notifications/open?id=00000000-0000-4000-8000-000000000001';
 mocks.login.mockResolvedValue({data:{session:{user:{id:'tester'}}},error:null});
 for(const from of [path,'https://attacker.example']) {
  render(<MemoryRouter initialEntries={[{pathname:'/',state:{from}}]}><LoginPage/></MemoryRouter>);
  fireEvent.change(screen.getByPlaceholderText('nama@perusahaan.com'),{target:{value:'tester@example.test'}});
  const password=screen.getByPlaceholderText('Masukkan password Anda');fireEvent.change(password,{target:{value:'test-only-fixture'}});fireEvent.submit(password.closest('form')!);
  await waitFor(()=>expect(mocks.navigate).toHaveBeenLastCalledWith(from===path?path:'/dashboard'));cleanup();
 }
});
