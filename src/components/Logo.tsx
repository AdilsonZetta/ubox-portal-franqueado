export function Logo({ claro = false, compacto = false }: { claro?: boolean; compacto?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-brand text-white shadow-sm">
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
          <rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" strokeWidth="1.8" />
          <path d="M3 9h18" stroke="#9dbe2e" strokeWidth="1.8" />
        </svg>
      </span>
      {compacto ? null : (
        <span className="leading-tight">
          <span className={`block text-[15px] font-extrabold tracking-[0.14em] ${claro ? 'text-white' : 'text-ink'}`}>UBOX</span>
          <span className={`block text-[10px] font-medium uppercase tracking-[0.16em] ${claro ? 'text-white/70' : 'text-ink/55'}`}>
            Portal do franqueado
          </span>
        </span>
      )}
    </span>
  )
}
