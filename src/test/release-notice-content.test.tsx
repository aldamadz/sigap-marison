import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ReleaseNoticeContent } from '@/components/app/ReleaseNoticeContent';

afterEach(cleanup);

describe('release notice plain-text lists', () => {
  it('groups consecutive hyphen, star and pasted bullet markers into real bullets', () => {
    render(<ReleaseNoticeContent items={['Pembaruan SIGAP:', '- Perbaikan dana', '* Pengingat pekerjaan', '\u2022 Pencarian proyek']} />);
    expect(screen.getByText('Pembaruan SIGAP:').tagName).toBe('P');
    const list = screen.getByRole('list');
    expect(list.tagName).toBe('UL'); expect(list).toHaveClass('list-disc');
    expect(within(list).getAllByRole('listitem').map(item => item.textContent)).toEqual(['Perbaikan dana', 'Pengingat pekerjaan', 'Pencarian proyek']);
  });
  it('retains explicit numbering and separates paragraphs and mixed lists', () => {
    render(<ReleaseNoticeContent items={['2. Buka konfigurasi', '4) Terbitkan', 'Catatan tetap tersimpan.', '- Tanpa maintenance', '1. Selesai']} />);
    const lists = screen.getAllByRole('list');
    expect(lists.map(list => list.tagName)).toEqual(['OL', 'UL', 'OL']);
    expect(lists[0]).toHaveAttribute('start', '2');
    expect(within(lists[0]).getAllByRole('listitem').map(item => item.getAttribute('value'))).toEqual(['2', '4']);
    expect(screen.getByText('Catatan tetap tersimpan.').tagName).toBe('P');
  });
  it('keeps existing plain notices and malformed markers as text, ignoring empty lines', () => {
    render(<ReleaseNoticeContent items={['', '   ', 'Perbaikan: Data dana', '-000 tetap', '1.500 rupiah', '-', '0. Bukan urutan']} />);
    expect(screen.queryByRole('list')).toBeNull();
    for (const text of ['Perbaikan: Data dana', '-000 tetap', '1.500 rupiah', '-', '0. Bukan urutan']) expect(screen.getByText(text)).toBeInTheDocument();
  });
  it('escapes markup and never interprets links, images or scripts', () => {
    const { container } = render(<ReleaseNoticeContent items={['- <img src=x onerror=alert(1)>', '1. <script>alert(1)</script>', '[tautan](javascript:alert(1))']} />);
    expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeInTheDocument();
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument();
    expect(container.querySelector('img, script, a')).toBeNull();
  });
});
