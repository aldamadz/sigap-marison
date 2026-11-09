import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import LoginPage from '@/pages/auth/LoginPage';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'light', setTheme: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals(); });

const submitReset = () => {
  render(<MemoryRouter><LoginPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole('button', { name: 'Lupa sandi?' }));
  const dialog = screen.getByRole('dialog');
  fireEvent.change(within(dialog).getByLabelText('Email kerja'), { target: { value: 'tester@example.test' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Kirim Link Reset' }));
};

it.each([
  { status: 503, error: 'service_unavailable' },
  { status: 503, error: 'maintenance' },
  { status: 500, error: '535 5.7.8 SMTP provider secret detail' },
])('shows safe recovery feedback for HTTP $status / $error', async ({ status, error }) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error }), { status })));
  submitReset();
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Layanan reset kata sandi sementara tidak tersedia. Silakan coba lagi atau hubungi admin.'));
  expect(toast.success).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Kirim Link Reset' })).toBeEnabled();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
});

it('explains rate limiting without exposing backend messages', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'internal-limit-key' }), { status: 429 })));
  submitReset();
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Terlalu banyak permintaan reset. Silakan tunggu beberapa saat sebelum mencoba lagi.'));
  expect(toast.success).not.toHaveBeenCalled();
});

it('does not show raw network errors', async () => {
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('private network detail')));
  submitReset();
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Permintaan reset kata sandi belum dapat dikirim. Periksa koneksi Anda lalu coba lagi.'));
});

it('preserves the same success message without claiming account existence', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
  vi.stubGlobal('fetch', fetch);
  submitReset();
  await waitFor(() => expect(toast.success).toHaveBeenCalledWith('Link reset kata sandi sudah dikirim jika email terdaftar.'));
  expect(fetch).toHaveBeenCalledWith('/api/auth/password-reset', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ email: 'tester@example.test' }),
  }));
});
