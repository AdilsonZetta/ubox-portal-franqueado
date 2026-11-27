import { useEffect, useState } from 'react'
import { ScanLine } from 'lucide-react'
import { Navigate } from 'react-router-dom'
import { Aviso, Button, Campo, Carregando, inputClass, Vazio } from '../components/ui'
import { useAuth } from '../lib/auth'
import { BACKEND } from '../lib/backend'
import { listarUnidades } from '../lib/gestao'
import { podeModulo } from '../lib/modulosAcesso'
import { useVisao } from '../lib/visao'
import { ConfiguracaoAsaas } from './ConfiguracaoAsaas'
import { PrepararFacial } from './PrepararFacial'
import { ConfiguracoesUnidade } from './acesso/ConfiguracoesUnidade'
import { ListaAcessos } from './acesso/ListaAcessos'

function SelecionarUnidade({ unidade, escolher }: { unidade: string; escolher: (id: string) => void }) {
  const [unidades, setUnidades] = useState<{ id: string; nome: string }[] | null>(null)
  const [tentativa, setTentativa] = useState(0)
  const [falha, setFalha] = useState(false)

  useEffect(() => {
    let vigente = true
    void listarUnidades()
      .then(lista => { if (vigente) setUnidades(lista.filter(item => item.ativo)) })
      .catch(() => { if (vigente) setFalha(true) })
    return () => { vigente = false }
  }, [tentativa])

  if (falha) return <div className="space-y-2">
    <Aviso tom="erro">Não foi possível carregar as unidades.</Aviso>
    <Button variant="secondary" onClick={() => { setFalha(false); setTentativa(atual => atual + 1) }}>Tentar novamente</Button>
  </div>
  if (!unidades) return <Carregando texto="Carregando unidades…" />
  if (!unidades.length) return <Vazio titulo="Nenhuma unidade ativa" texto="Ative uma unidade para gerenciar seus acessos." />
  return (
    <div className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
      <Campo label="Unidade">
        <select className={inputClass} value={unidade} onChange={evento => escolher(evento.target.value)}>
          <option value="">Selecione uma unidade</option>
          {unidades.map(item => <option key={item.id} value={item.id}>{item.nome}</option>)}
        </select>
      </Campo>
    </div>
  )
}

function AcessoDaUnidade({ unidade }: { unidade: string }) {
  const [configurando, setConfigurando] = useState(false)
  const [revisao, setRevisao] = useState(0)
  return (
    <>
      <ListaAcessos unidade={unidade} revisao={revisao} />
      <section className="space-y-4 rounded-2xl border border-line bg-surface p-4 sm:p-6">
        <header className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Configurações</h2>
          <Button type="button" variant="secondary" aria-expanded={configurando} onClick={() => setConfigurando(atual => !atual)}>
            {configurando ? 'Fechar configurações' : 'Abrir configurações'}
          </Button>
        </header>
        {configurando && <ConfiguracoesUnidade unidade={unidade} aoAlterarStatus={() => setRevisao(atual => atual + 1)} />}
      </section>
    </>
  )
}

export function ControleAcessoPage() {
  const { user } = useAuth()
  const { comoFranqueado, simulado } = useVisao()
  const [selecionada, setSelecionada] = useState('')
  const admin = user?.papel === 'admin'
  const adminRede = admin && !comoFranqueado
  const unidade = adminRede ? selecionada : (comoFranqueado ? simulado : user)?.unidadeId
  const equipe = user?.papel === 'franqueado' || user?.papel === 'equipe_franqueado'
  if (!user?.ativo || user.recusado || (!admin && (!equipe || !podeModulo(user, 'acesso', false)))) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <header className="flex items-start gap-4">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-lime-tint text-lime-dark">
          <ScanLine className="size-6" aria-hidden="true" />
        </span>
        <div className="min-w-0 space-y-2">
          <h1 className="text-balance text-2xl font-bold sm:text-3xl">Controle de Acesso Inteligente</h1>
          <p className="text-sm text-muted">Cobranças, tolerância e liberações de acesso por unidade.</p>
        </div>
      </header>
      {BACKEND !== 'supabase' ? (
        <Aviso>Este módulo está disponível apenas no ambiente Supabase.</Aviso>
      ) : (
        <>
          {adminRede && <SelecionarUnidade unidade={selecionada} escolher={setSelecionada} />}
          {unidade ? <AcessoDaUnidade key={unidade} unidade={unidade} /> : <Aviso>Selecione uma unidade para gerenciar clientes e configurações.</Aviso>}
          {adminRede && (
            <details className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
              <summary className="cursor-pointer font-semibold">Ferramentas da administração da rede</summary>
              <div className="mt-4 space-y-4">
                <ConfiguracaoAsaas />
                <PrepararFacial />
              </div>
            </details>
          )}
        </>
      )}
    </div>
  )
}
