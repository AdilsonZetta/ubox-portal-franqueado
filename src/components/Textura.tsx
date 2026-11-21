type VarianteTextura = 'mosaico' | 'linha'

function fundoTextura(variante: VarianteTextura) {
  const linha = variante === 'linha'
  const blocos = linha ? '' : `
    <path fill="#A2BD2B" d="M0 0h72v72H0z"/>
    <path fill="#23292A" d="M72 0h72v72H72zM216 0h72v72h-72z"/>
    <path fill="#E95F0C" d="M144 0h72v72h-72zM360 0h72v72h-72z"/>
    <path fill="#FFFFFB" d="M288 0h72v72h-72z"/>
  `
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 432 72">
    ${blocos}
    <g fill="none" stroke-width="${linha ? 1.5 : 3}" opacity="${linha ? 0.25 : 1}">
      <path fill="${linha ? 'none' : '#C8DD66'}" stroke="${linha ? '#C8DD66' : '#23292A'}" d="M15 15h42v42H15z"/>
      <path fill="${linha ? 'none' : '#A2BD2B'}" stroke="${linha ? '#C8DD66' : '#23292A'}" d="M26 26h20v20H26z"/>
      <path fill="${linha ? 'none' : '#E95F0C'}" stroke="${linha ? '#CBCFD1' : '#E95F0C'}" d="M80 36a28 28 0 0 1 56 0z"/>
      <path stroke="${linha ? '#CBCFD1' : '#F8A879'}" d="m148 28 24-24m-24 48 48-48m-44 68 60-60m-36 60 36-36m-12 36 12-12"/>
      <g fill="${linha ? 'none' : '#C8DD66'}" stroke="#C8DD66" stroke-width="${linha ? 1.5 : 0}">
        <circle cx="234" cy="18" r="3"/><circle cx="252" cy="18" r="3"/><circle cx="270" cy="18" r="3"/>
        <circle cx="234" cy="36" r="3"/><circle cx="252" cy="36" r="3"/><circle cx="270" cy="36" r="3"/>
        <circle cx="234" cy="54" r="3"/><circle cx="252" cy="54" r="3"/><circle cx="270" cy="54" r="3"/>
      </g>
      <path fill="${linha ? 'none' : '#A2BD2B'}" stroke="${linha ? '#C8DD66' : '#A2BD2B'}" d="m291 62 19-28 18 28zm29-24 18-28 19 28z"/>
      <circle cx="396" cy="36" r="20" stroke="${linha ? '#CBCFD1' : '#23292A'}" stroke-width="${linha ? 1.5 : 8}"/>
    </g>
  </svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`
}

const fundos = {
  mosaico: fundoTextura('mosaico'),
  linha: fundoTextura('linha'),
}

export function Textura({ variante = 'mosaico', className = '' }: {
  variante?: VarianteTextura
  className?: string
}) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className={`textura textura-${variante} ${className}`}
      style={{ backgroundImage: fundos[variante] }}
    />
  )
}
