export function Textura({ variante = 'mosaico', className }: {
  variante?: 'mosaico' | 'linha'
  className?: string
}) {
  const linha = variante === 'linha'

  return (
    <svg
      viewBox="0 0 432 72"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {!linha && (
        <g>
          <path className="fill-lime" d="M0 0h72v72H0z" />
          <path className="fill-graphite" d="M72 0h72v72H72zM216 0h72v72h-72z" />
          <path className="fill-brand-vivid" d="M144 0h72v72h-72zM360 0h72v72h-72z" />
          <path className="fill-surface" d="M288 0h72v72h-72z" />
        </g>
      )}
      <g opacity={linha ? 0.2 : 1} strokeWidth={linha ? 1.5 : 3}>
        <rect x="15" y="15" width="42" height="42" className={linha ? 'fill-none' : 'fill-lime-soft'} stroke="var(--color-lime-dark)" />
        <rect x="26" y="26" width="20" height="20" className={linha ? 'fill-none' : 'fill-lime'} stroke="var(--color-lime-dark)" />
        <path d="M80 36a28 28 0 0 1 56 0z" className={linha ? 'fill-none' : 'fill-brand-vivid'} stroke="var(--color-brand-vivid)" />
        <path d="m148 28 24-24m-24 48 48-48m-44 68 60-60m-36 60 36-36m-12 36 12-12" stroke="var(--color-brand-soft)" />
        <path d="M234 18h.1m18 0h.1m18 0h.1m-36 18h.1m18 0h.1m18 0h.1m-36 18h.1m18 0h.1m18 0h.1" stroke="var(--color-lime-soft)" strokeWidth="6" strokeLinecap="round" />
        <path d="m291 62 19-28 18 28zm29-24 18-28 19 28z" className={linha ? 'fill-none' : 'fill-lime'} stroke="var(--color-lime)" />
        <circle cx="396" cy="36" r="20" fill="none" stroke="var(--color-graphite)" strokeWidth={linha ? 1.5 : 8} />
      </g>
    </svg>
  )
}
