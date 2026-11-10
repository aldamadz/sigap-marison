import { readFileSync } from 'node:fs';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation, useNavigate, useNavigationType } from 'react-router';
import { afterEach, describe, expect, it } from 'vitest';
import { Breadcrumbs } from '@/components/ui/Breadcrumbs';
import { SubmissionStatusRedirect } from '@/components/layout/SubmissionStatusRedirect';

afterEach(cleanup);

function StatusProbe() {
  const location = useLocation();
  const navigationType = useNavigationType();
  const navigate = useNavigate();
  return <>
    <Breadcrumbs />
    <output aria-label="Location">{location.pathname + location.search + location.hash}</output>
    <output aria-label="State">{JSON.stringify(location.state)}</output>
    <output aria-label="Navigation">{navigationType}</output>
    <button onClick={() => navigate(-1)}>Back</button>
  </>;
}

describe('submission status navigation', () => {
  it.each(['/surat/monitoring', '/surat/monitoring/'])('redirects %s without losing filters, document, hash or state', async (pathname) => {
    render(<MemoryRouter initialEntries={['/dashboard', {
      pathname, search: '?document=doc-1&status=DONE&search=KC%20Pati', hash: '#approval',
      state: { from: 'notification' },
    }]} initialIndex={1}>
      <Routes>
        <Route path="/dashboard" element={<h1>Dashboard</h1>} />
        <Route path="/surat/monitoring" element={<SubmissionStatusRedirect />} />
        <Route path="/status-pengajuan" element={<StatusProbe />} />
      </Routes>
    </MemoryRouter>);
    await waitFor(() => expect(screen.getByLabelText('Location')).toHaveTextContent('/status-pengajuan?document=doc-1&status=DONE&search=KC%20Pati#approval'));
    expect(screen.getByLabelText('State')).toHaveTextContent('{"from":"notification"}');
    expect(screen.getByLabelText('Navigation')).toHaveTextContent('REPLACE');
    expect(within(screen.getByRole('navigation', { name: 'Breadcrumb' })).getByText('Status Pengajuan')).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it.each(['/status-pengajuan', '/status-pengajuan/', '/surat/monitoring'])('shows a flat and accurate breadcrumb for %s', (path) => {
    render(<MemoryRouter initialEntries={[path]}><Breadcrumbs /></MemoryRouter>);
    const breadcrumb = within(screen.getByRole('navigation', { name: 'Breadcrumb' }));
    expect(breadcrumb.getAllByRole('link')).toHaveLength(1);
    expect(breadcrumb.getByRole('link', { name: 'Beranda' })).toHaveAttribute('href', '/dashboard');
    expect(breadcrumb.getByText('Status Pengajuan')).toHaveAttribute('aria-current', 'page');
    expect(breadcrumb.queryByText('Surat')).not.toBeInTheDocument();
    expect(breadcrumb.queryByText('Monitoring Surat')).not.toBeInTheDocument();
  });

  it('respects hidden home and explicit breadcrumbs', () => {
    const view = render(<MemoryRouter initialEntries={['/status-pengajuan']}><Breadcrumbs showHome={false} /></MemoryRouter>);
    expect(screen.queryByText('Beranda')).not.toBeInTheDocument();
    expect(screen.getByText('Status Pengajuan')).toHaveAttribute('aria-current', 'page');
    view.rerender(<MemoryRouter><Breadcrumbs items={[{ label: 'Custom' }]} showHome={false} /></MemoryRouter>);
    expect(screen.getByText('Custom')).toBeInTheDocument();
  });

  it('wires both aliases inside the protected app shell and preserves sidebar status behavior', () => {
    const app = readFileSync('src/App.tsx', 'utf8');
    const routes = app.slice(app.indexOf('{/* PROTECTED ROUTES */}'), app.indexOf('{/* ADMIN MODULE */}'));
    expect(routes).toContain('<Route path="/status-pengajuan" element={<MonitoringPage />} />');
    expect(routes).toContain('<Route path="/surat/monitoring" element={<SubmissionStatusRedirect />} />');
    const sidebar = readFileSync('src/components/layout/Sidebar.tsx', 'utf8');
    expect(sidebar).toContain("renderNavLink('/status-pengajuan', 'Status Pengajuan'");
    expect(sidebar).toContain("path === '/status-pengajuan'");
    expect(sidebar).toContain("isSubItem && (path.startsWith('/surat/') || path === '/status-pengajuan')");
    expect(sidebar).toContain('creator_seen_at');
  });
});
