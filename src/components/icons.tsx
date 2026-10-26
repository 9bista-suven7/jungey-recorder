import type { Layout } from '../types';

/** Tiny diagrams of each layout, so the choice is obvious at a glance. */
export function LayoutIcon({ kind }: { kind: Layout }) {
  return (
    <svg width="26" height="18" viewBox="0 0 26 18" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      {kind === 'side' ? (
        <>
          <rect x="1" y="1" width="15.5" height="16" rx="2.5" />
          <rect x="18.5" y="1" width="6.5" height="16" rx="2" fill="currentColor" stroke="none" />
        </>
      ) : (
        <rect x="1" y="1" width="24" height="16" rx="2.5" />
      )}
      {kind === 'board' && <path d="M5 11c2-4 3.5-4 5 0s3.5 3 5-1.5" strokeLinecap="round" />}
      {kind === 'board-cam' && (
        <>
          <path d="M4.5 9c1.6-3.4 3-3.4 4.4 0" strokeLinecap="round" />
          <circle cx="19.2" cy="12" r="3.3" fill="currentColor" stroke="none" />
        </>
      )}
      {kind === 'side' && <path d="M4.5 10c1.6-3.4 3-3.4 4.4 0" strokeLinecap="round" />}
      {kind === 'cam' && (
        <>
          <circle cx="13" cy="7.4" r="2.9" />
          <path d="M7.4 17c1-3.3 3.1-4.8 5.6-4.8s4.6 1.5 5.6 4.8" />
        </>
      )}
      {kind === 'screen-cam' && (
        <>
          <path d="M1 5.2h24" />
          <circle cx="19.2" cy="12" r="3" fill="currentColor" stroke="none" />
        </>
      )}
    </svg>
  );
}

export function LaserIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="12" r="3.2" fill="currentColor" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" opacity=".55" />
    </svg>
  );
}

export function ShapeIcon({ shape }: { shape: string }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {shape === 'line' && <path d="M5 19L19 5" />}
      {shape === 'arrow' && <path d="M5 19L19 5M10 5h9v9" />}
      {shape === 'rect' && <rect x="4" y="6" width="16" height="12" rx="2" />}
      {shape === 'ellipse' && <ellipse cx="12" cy="12" rx="8.5" ry="6.5" />}
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" aria-hidden>
      <defs>
        <linearGradient id="jungey-logo-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3ff0a8" />
          <stop offset="1" stopColor="#0a9670" />
        </linearGradient>
      </defs>
      <rect x="24" y="24" width="464" height="464" rx="110" fill="url(#jungey-logo-bg)" />
      <rect x="88" y="148" width="304" height="236" rx="42" fill="#fff" />
      <path d="M206 214v104l88-52z" fill="#0a9670" stroke="#0a9670" strokeWidth="20" strokeLinejoin="round" />
      <circle cx="386" cy="148" r="64" fill="#ff3b4e" stroke="#fff" strokeWidth="20" />
    </svg>
  );
}
