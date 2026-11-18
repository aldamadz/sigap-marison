import { useEffect, useState } from 'react';
import { Pause, Play } from 'lucide-react';

const quotes = [
  ['CONSISTENCY', 'BEATS TALENT'],
  ['INTEGRITAS', 'BICARA MELALUI TINDAKAN NYATA'],
  ['FOCUS', 'SAY NO TO A THOUSAND GOOD THINGS'],
  ['KONSISTENSI', 'USAHA KECIL YANG DILAKUKAN SETIAP HARI'],
  ['CLARITY', 'DISSOLVES CHAOS AND DOUBT'],
  ['KUALITAS', 'HASIL DARI NIAT TINGGI DAN EKSEKUSI CERDAS'],
] as const;

const particles = Array.from({ length: 32 }, (_, i) => ({
  top: `${3 + ((i * 53 + i * i * 7) % 94)}%`,
  left: `${2 + ((i * 43 + i * i * 11) % 96)}%`,
  width: i % 5 === 0 ? 3 : 2,
  height: i % 5 === 0 ? 3 : 2,
  animationDelay: `-${i * 0.73}s`,
  animationDuration: `${10 + i % 9}s`,
}));

export function LoginSpotlight() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const canAnimate = window.matchMedia('(min-width: 1025px) and (prefers-reduced-motion: no-preference)');
    let timer: number | undefined;
    const sync = () => {
      window.clearInterval(timer);
      if (canAnimate.matches && !document.hidden) {
        timer = window.setInterval(() => setIndex(current => (current + 1) % quotes.length), 5000);
      }
    };
    sync();
    canAnimate.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.clearInterval(timer);
      canAnimate.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, [paused]);

  const [word, line] = quotes[index];
  return (
    <aside className="sigap-login-spotlight" aria-label="Sorotan" data-paused={paused}>
      <div className="sigap-login-dust" aria-hidden="true">
        {particles.map((particle, i) => <span key={i} style={particle} />)}
      </div>
      <div className="sigap-login-quote">
        <div key={index} className="sigap-login-quote-text">
          <p className="sigap-login-quote-word">{word}</p>
          <p className="sigap-login-quote-line">{line}</p>
        </div>
      </div>
      <button
        type="button"
        className="sigap-login-motion"
        aria-label={paused ? 'Lanjutkan animasi' : 'Jeda animasi'}
        title={paused ? 'Lanjutkan animasi' : 'Jeda animasi'}
        onClick={() => setPaused(value => !value)}
      >
        {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
      </button>
    </aside>
  );
}
