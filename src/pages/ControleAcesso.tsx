import { ScanLine } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { Aviso, Selo } from '../components/ui'
import { useAuth } from '../lib/auth'
import { BACKEND } from '../lib/backend'
import { podeModulo } from '../lib/modulosAcesso'
import { useVisao } from '../lib/visao'
import { ConfiguracaoAsaas } from './ConfiguracaoAsaas'
import { ConsultaBoletos } from './ConsultaBoletos'

export function ControleAcessoPage() {
  const { user } = useAuth()
  const { ehAdmin, comoFranqueado, simulado } = useVisao()
  const admin = user?.papel === 'admin' && ehAdmin && !comoFranqueado
  if (!admin && !podeModulo(comoFranqueado ? simulado : user, 'acesso', comoFranqueado)) return <Navigate to="/" replace />

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <header className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-lime-tint text-lime-dark">
          <ScanLine className="size-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-2">
          <h1 className="text-balance text-2xl font-bold sm:text-3xl">Controle de Acesso Inteligente</h1>
          <Selo>Integração facial em preparação</Selo>
        </div>
      </header>
      {admin && BACKEND === 'supabase' ? (
        <>
          <ConfiguracaoAsaas />
          <ConsultaBoletos />
        </>
      ) : (
        <Aviso>A consulta por CPF ou CNPJ está disponível para a administração da franqueadora.</Aviso>
      )}
    </div>
  )
}
