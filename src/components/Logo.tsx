import principal from '../assets/marca/ubox-logo.svg?url'
import fundoEscuro from '../assets/marca/ubox-logo-fundo-escuro.svg?url'
import simbolo from '../assets/marca/ubox-simbolo.svg?url'
import horizontal from '../assets/marca/ubox-logo-horizontal.svg?url'

const marcas = { claro: principal, escuro: fundoEscuro, simbolo, horizontal }

export function Logo({ claro = false, compacto = false, variante }: {
  claro?: boolean
  compacto?: boolean
  variante?: keyof typeof marcas
}) {
  const marca = compacto ? 'simbolo' : variante ?? (claro ? 'escuro' : 'claro')
  const corLegenda = marca === 'escuro' ? 'text-line-strong' : 'text-muted'

  return (
    <span className="inline-flex max-w-full flex-col items-start gap-1.5 py-1">
      <img
        src={marcas[marca]}
        className={marca === 'simbolo' ? 'h-6 w-auto' : marca === 'horizontal' ? 'h-7 w-auto' : 'h-12 w-auto'}
        alt="UBOX Self Storage"
      />
      {marca === 'simbolo' ? null : (
        <span className={`text-[10px] font-medium uppercase tracking-[0.14em] ${corLegenda}`}>
          Portal do franqueado
        </span>
      )}
    </span>
  )
}
