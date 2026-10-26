// Small illustrations for the home screen cards.
import { useId } from 'react';

function Person({ cx, cy, r, bg = '#8b7bff' }: { cx: number; cy: number; r: number; bg?: string }) {
  const id = useId();
  return (
    <g>
      <clipPath id={id}>
        <circle cx={cx} cy={cy} r={r} />
      </clipPath>
      <circle cx={cx} cy={cy} r={r} fill={bg} />
      <g clipPath={`url(#${id})`} fill="#fde7d4">
        <circle cx={cx} cy={cy - r * 0.18} r={r * 0.33} />
        <ellipse cx={cx} cy={cy + r * 0.85} rx={r * 0.68} ry={r * 0.55} />
      </g>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#fff" strokeWidth="3" />
    </g>
  );
}

const chalk = { fill: 'none', stroke: '#f4f1e8', strokeWidth: 3, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
const hand = { fontFamily: 'Caveat, cursive', fontWeight: 700 };

export function PresetArt({ id }: { id: string }) {
  switch (id) {
    case 'blackboard':
      return (
        <svg viewBox="0 0 320 200" aria-hidden>
          <rect width="320" height="200" fill="#23292b" />
          <text x="26" y="62" fontSize="36" fill="#f4f1e8" {...hand}>a² + b² = c²</text>
          <path d="M34 160 L128 160 L34 92 Z" {...chalk} />
          <path d="M34 146h14v14" {...chalk} strokeWidth={2} />
          <text x="72" y="182" fontSize="20" fill="#ffe27a" {...hand}>b</text>
          <text x="14" y="132" fontSize="20" fill="#ffe27a" {...hand}>a</text>
          <text x="86" y="120" fontSize="20" fill="#ffe27a" {...hand}>c</text>
          <path d="M150 112c18-16 40-16 58 0" {...chalk} stroke="#8fd3ff" />
          <Person cx={262} cy={148} r={34} />
        </svg>
      );
    case 'flow':
      return (
        <svg viewBox="0 0 320 200" aria-hidden>
          <defs>
            <pattern id="flow-dots" width="16" height="16" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1.2" fill="rgba(160,170,255,0.16)" />
            </pattern>
          </defs>
          <rect width="320" height="200" fill="#14161f" />
          <rect width="320" height="200" fill="url(#flow-dots)" />
          <g fill="none" stroke="#6b7387" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M74 66h40" />
            <path d="M164 66h22c10 0 14 4 14 14v30c0 10 4 14 14 14h10" stroke="#6aa8ff" />
            <path d="M139 92v38" />
          </g>
          <path d="M108 60l8 6-8 6M218 118l8 6-8 6" fill="#6b7387" />
          <rect x="22" y="40" width="52" height="52" rx="12" fill="#fff" />
          <circle cx="48" cy="66" r="13" fill="#8b7bff" />
          <rect x="114" y="40" width="52" height="52" rx="12" fill="#fff" />
          <path d="M140 52c7 6 9 14 0 28-9-14-7-22 0-28z" fill="#47a248" />
          <rect x="226" y="98" width="52" height="52" rx="12" fill="#fff" style={{ filter: 'drop-shadow(0 0 8px #6aa8ff)' }} />
          <rect x="238" y="112" width="28" height="24" rx="4" fill="#2496ed" />
          <rect x="102" y="130" width="74" height="34" rx="10" fill="rgba(255,171,94,0.16)" stroke="#ffab5e" strokeWidth="2.5" />
          <text x="139" y="152" textAnchor="middle" fontSize="13" fontWeight="700" fill="#eef0f4" fontFamily="Inter, sans-serif">Kafka</text>
          <rect x="176" y="72" width="44" height="18" rx="9" fill="#6aa8ff" />
          <text x="198" y="85" textAnchor="middle" fontSize="10" fontWeight="700" fill="#0b0d12" fontFamily="Inter, sans-serif">JSON</text>
          <circle cx="282" cy="40" r="13" fill="#8b7bff" />
          <text x="282" y="45" textAnchor="middle" fontSize="13" fontWeight="800" fill="#fff" fontFamily="Inter, sans-serif">→</text>
        </svg>
      );
    case 'whiteboard':
      return (
        <svg viewBox="0 0 320 200" aria-hidden>
          <rect width="320" height="200" fill="#fbfbf9" />
          <g fill="none" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <rect x="22" y="40" width="70" height="44" rx="8" stroke="#1d64d8" />
            <rect x="124" y="40" width="70" height="44" rx="8" stroke="#1f9d55" />
            <path d="M94 62h26M112 54l8 8-8 8" stroke="#1f2328" />
            <path d="M159 88v26M151 106l8 8 8-8" stroke="#1f2328" />
            <ellipse cx="159" cy="146" rx="42" ry="22" stroke="#d93a3a" />
          </g>
          <text x="36" y="70" fontSize="22" fill="#1d64d8" {...hand}>Idea</text>
          <text x="137" y="70" fontSize="22" fill="#1f9d55" {...hand}>Build</text>
          <text x="137" y="153" fontSize="22" fill="#d93a3a" {...hand}>Ship!</text>
          <Person cx={268} cy={150} r={32} />
        </svg>
      );
    case 'screen':
      return (
        <svg viewBox="0 0 320 200" aria-hidden>
          <rect width="320" height="200" fill="#1b1e26" />
          <rect x="20" y="18" width="280" height="166" rx="10" fill="#eef0f4" />
          <path d="M20 28a10 10 0 0 1 10-10h260a10 10 0 0 1 10 10v12H20z" fill="#d9dce3" />
          <g fill="#f87171"><circle cx="34" cy="29" r="4" /></g>
          <g fill="#fbbf24"><circle cx="47" cy="29" r="4" /></g>
          <g fill="#34d399"><circle cx="60" cy="29" r="4" /></g>
          <g fill="#c4c9d4">
            <rect x="40" y="58" width="150" height="10" rx="5" />
            <rect x="40" y="80" width="200" height="8" rx="4" />
            <rect x="40" y="96" width="180" height="8" rx="4" />
            <rect x="40" y="112" width="120" height="8" rx="4" />
          </g>
          <ellipse cx="112" cy="84" rx="92" ry="20" fill="none" stroke="#ffd60a" strokeWidth="4" strokeLinecap="round" />
          <path d="M210 130c-10 10-30 12-44 2" fill="none" stroke="#ff375f" strokeWidth="4" strokeLinecap="round" />
          <Person cx={262} cy={146} r={30} />
        </svg>
      );
    case 'slides':
      return (
        <svg viewBox="0 0 320 200" aria-hidden>
          <rect width="320" height="200" fill="#e9e7f5" />
          <rect x="44" y="30" width="200" height="140" rx="6" fill="#fff" transform="rotate(-4 144 100)" opacity=".6" />
          <rect x="34" y="24" width="210" height="148" rx="6" fill="#fff" stroke="#d7d4ea" />
          <rect x="52" y="42" width="120" height="14" rx="4" fill="#3b3486" />
          <g fill="#b9b5d6">
            <rect x="52" y="74" width="150" height="8" rx="4" />
            <rect x="52" y="92" width="130" height="8" rx="4" />
            <rect x="52" y="110" width="160" height="8" rx="4" />
          </g>
          <path d="M50 126c30 4 70 4 110-1" fill="none" stroke="#d93a3a" strokeWidth="4" strokeLinecap="round" />
          <rect x="52" y="104" width="104" height="18" rx="3" fill="#ffe45e" opacity=".55" />
          <text x="196" y="160" fontSize="26" fill="#d93a3a" {...hand}>!</text>
          <Person cx={272} cy={146} r={30} />
        </svg>
      );
    case 'talking':
      return (
        <svg viewBox="0 0 320 200" aria-hidden>
          <defs>
            <linearGradient id="th" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0" stopColor="#3b2f73" />
              <stop offset="1" stopColor="#151a2e" />
            </linearGradient>
          </defs>
          <rect width="320" height="200" fill="url(#th)" />
          <g fill="#fde7d4">
            <circle cx="160" cy="104" r="34" />
            <ellipse cx="160" cy="214" rx="78" ry="62" />
          </g>
          <rect x="70" y="14" width="180" height="40" rx="10" fill="rgba(10,12,18,.72)" />
          <g fill="#e9e6ff">
            <rect x="84" y="24" width="120" height="6" rx="3" />
            <rect x="84" y="37" width="150" height="6" rx="3" opacity=".55" />
          </g>
        </svg>
      );
    case 'shorts':
      return (
        <svg viewBox="0 0 320 200" aria-hidden>
          <rect width="320" height="200" fill="#15171d" />
          <rect x="116" y="8" width="88" height="184" rx="14" fill="#23292b" stroke="#3a3f4a" strokeWidth="2" />
          <clipPath id="sh-top">
            <rect x="122" y="14" width="76" height="70" rx="9" />
          </clipPath>
          <rect x="122" y="14" width="76" height="70" rx="9" fill="#8b7bff" />
          <g clipPath="url(#sh-top)" fill="#fde7d4">
            <circle cx="160" cy="44" r="14" />
            <ellipse cx="160" cy="92" rx="30" ry="24" />
          </g>
          <text x="128" y="128" fontSize="24" fill="#f4f1e8" {...hand}>x² + 1</text>
          <path d="M130 150c16 18 44 18 60 0" {...chalk} stroke="#ffe27a" />
          <path d="M40 60v80M280 60v80" stroke="#2c303a" strokeWidth="2" strokeDasharray="4 6" />
        </svg>
      );
    default:
      return null;
  }
}
