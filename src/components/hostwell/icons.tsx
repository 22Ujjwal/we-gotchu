import type { Feature } from '#/lib/hostwell/fixture'

const stroke = {
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

export function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <path d="M11 2 L20 18 H2 Z" fill="#1F1B16" />
      <path d="M11 9 L15.5 18 H6.5 Z" fill="#FFFFFF" />
    </svg>
  )
}

export function FeatureIcon({
  icon,
  size = 20,
}: {
  icon: Feature['icon'] | 'pin'
  size?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      aria-hidden
      className="shrink-0 text-ink"
    >
      {icon === 'guests' && (
        <g {...stroke}>
          <circle cx="7" cy="7" r="3" />
          <path d="M2 17c0-3 2.5-5 5-5s5 2 5 5" />
          <circle cx="14" cy="8" r="2.5" />
          <path d="M13 12.5c2.5 0 5 1.5 5 4.5" />
        </g>
      )}
      {icon === 'leaf' && (
        <g {...stroke}>
          <path d="M4 16C4 8 9 4 17 4c0 8-4 13-11 13" />
          <path d="M4 16l7-7" />
        </g>
      )}
      {icon === 'calendar' && (
        <g {...stroke}>
          <rect x="3" y="4" width="14" height="13" rx="2" />
          <path d="M3 8h14M7 2v4M13 2v4M7 12l2 2 4-4" />
        </g>
      )}
      {icon === 'fee' && (
        <g {...stroke}>
          <circle cx="10" cy="10" r="7" />
          <path d="M12.5 7.5a3 3 0 1 0 0 5M6 9h5M6 11h5" />
        </g>
      )}
      {icon === 'flame' && (
        <path
          {...stroke}
          d="M10 2c1 3 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 1 1 2 2 3 2 0-2 0-4 0-6z"
        />
      )}
      {icon === 'train' && (
        <g {...stroke}>
          <rect x="5" y="3" width="10" height="11" rx="2" />
          <path d="M5 10h10M7 17l-2 2M13 17l2 2" />
        </g>
      )}
      {icon === 'pin' && (
        <g {...stroke}>
          <path d="M10 18s6-5.2 6-10a6 6 0 0 0-12 0c0 4.8 6 10 6 10z" />
          <circle cx="10" cy="8" r="2.2" />
        </g>
      )}
    </svg>
  )
}

export function Chevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden>
      <path
        d={dir === 'left' ? 'M10 3L5 8l5 5' : 'M6 3l5 5-5 5'}
        fill="none"
        stroke="#1F1B16"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function ArrowRight() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden>
      <path {...stroke} d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  )
}

export function ArrowUp() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden>
      <path
        d="M8 13V3M3.5 7.5L8 3l4.5 4.5"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Check() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden>
      <path
        d="M3 7.2l2.6 2.6L11 4.4"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Plus() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
      <path
        d="M6 1.5v9M1.5 6h9"
        stroke="#8A8174"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

export function Ticket() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden>
      <g
        fill="none"
        stroke="#6B5A35"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path
          d="M3 8a2 2 0 0 0 0 4v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4a2 2 0 0 0 0-4V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z"
          transform="translate(0 1)"
        />
        <path d="M14 5v14" strokeDasharray="2 2" />
      </g>
    </svg>
  )
}

const sealPoints =
  '48.0,1.0 52.7,6.3 58.5,2.2 61.9,8.4 68.4,5.7 70.3,12.4 77.3,11.3 77.7,18.3 84.7,18.7 83.6,25.7 90.3,27.6 87.6,34.1 93.8,37.5 89.7,43.3 95.0,48.0 89.7,52.7 93.8,58.5 87.6,61.9 90.3,68.4 83.6,70.3 84.7,77.3 77.7,77.7 77.3,84.7 70.3,83.6 68.4,90.3 61.9,87.6 58.5,93.8 52.7,89.7 48.0,95.0 43.3,89.7 37.5,93.8 34.1,87.6 27.6,90.3 25.7,83.6 18.7,84.7 18.3,77.7 11.3,77.3 12.4,70.3 5.7,68.4 8.4,61.9 2.2,58.5 6.3,52.7 1.0,48.0 6.3,43.3 2.2,37.5 8.4,34.1 5.7,27.6 12.4,25.7 11.3,18.7 18.3,18.3 18.7,11.3 25.7,12.4 27.6,5.7 34.1,8.4 37.5,2.2 43.3,6.3'

export function GoldSeal() {
  return (
    <svg
      width="96"
      height="96"
      viewBox="0 0 96 96"
      aria-hidden
      className="shrink-0"
      style={{ filter: 'drop-shadow(#966E1E59 0px 12px 22px)' }}
    >
      <defs>
        <linearGradient id="seal-gold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F0D58C" />
          <stop offset="0.5" stopColor="#C99A3B" />
          <stop offset="1" stopColor="#B4852A" />
        </linearGradient>
      </defs>
      <polygon points={sealPoints} fill="url(#seal-gold)" />
      <path
        d="M33 48.5l10 10L64 37"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
