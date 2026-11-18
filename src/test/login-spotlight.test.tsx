import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LoginSpotlight } from '@/pages/auth/LoginSpotlight';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function setMotionAllowed(matches: boolean) {
  const matchMedia = window.matchMedia;
  vi.spyOn(window, 'matchMedia').mockImplementation(query => ({ ...matchMedia(query), matches }));
}

it('can start with a different quote on a fresh mount without separating its caption', () => {
  const random = vi.spyOn(Math, 'random').mockReturnValue(0.999);
  const first = render(<LoginSpotlight />);
  expect(screen.getByText('CONSISTENCY')).toBeInTheDocument();
  expect(screen.getByText('BEATS TALENT')).toBeInTheDocument();
  first.unmount();

  random.mockReturnValue(0);
  render(<LoginSpotlight />);
  expect(screen.getByText('INTEGRITAS')).toBeInTheDocument();
  expect(screen.getByText('BICARA MELALUI TINDAKAN NYATA')).toBeInTheDocument();
});

it('cycles through a shuffled set without repeats before wrapping', () => {
  vi.useFakeTimers();
  vi.spyOn(Math, 'random').mockReturnValue(0);
  setMotionAllowed(true);
  render(<LoginSpotlight />);

  for (const word of ['INTEGRITAS', 'FOCUS', 'KONSISTENSI', 'CLARITY', 'KUALITAS', 'CONSISTENCY', 'INTEGRITAS']) {
    expect(screen.getByText(word, { exact: true })).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(5000));
  }
});

it('does not rotate when the desktop motion query does not match', () => {
  vi.useFakeTimers();
  setMotionAllowed(false);
  const { container } = render(<LoginSpotlight />);
  const first = container.querySelector('.sigap-login-quote-word')?.textContent;
  expect(first).toBeTruthy();
  act(() => vi.advanceTimersByTime(15000));
  expect(container.querySelector('.sigap-login-quote-word')).toHaveTextContent(first!);
});
