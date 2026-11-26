import { Link } from 'react-router-dom'
import { Aviso, Button, Carregando, Selo } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import type { Pendencia } from '../../lib/pendencias'
import { usePendencias } from '../../lib/usePendencias'

export function PendenciasInicio({ pessoal = false }: { pessoal?: boolean }) {
  const { user } = useAuth()
  const rede = user?.papel === 'admin' || user?.papel === 'equipe_franqueadora'
  const pendencias = usePendencias(pessoal)
  const avisos = pendencias.itens.filter(({ id }) => id === 'avisos' || id === 'leituras')
  const tarefas = pendencias.itens.filter(({ id }) => id !== 'avisos' && id !== 'leituras')

  return (
    <>
      <section className="mt-6 space-y-3" aria-labelledby="pendencias-titulo">
        <h2 id="pendencias-titulo" className="text-lg font-bold">{rede ? 'Avisos e leituras' : 'Pendências'}</h2>
        {pendencias.carregando ? <Carregando texto={rede ? 'Consultando avisos e leituras…' : 'Consultando pendências…'} /> : null}
        {pendencias.falhou ? (
          <Aviso>
            Algumas informações ficaram indisponíveis.{' '}
            <Button variant="ghost" onClick={pendencias.recarregar} disabled={pendencias.carregando}>Tentar novamente</Button>
          </Aviso>
        ) : null}
        {!pendencias.carregando && !pendencias.falhou && !(rede ? avisos : pendencias.itens).length ? (
          <p className="text-sm text-muted">{rede ? 'Nenhum aviso ou leitura pendente.' : 'Você está em dia. Escolha um módulo abaixo para continuar.'}</p>
        ) : null}
        <ListaPendencias itens={rede ? avisos : pendencias.itens} />
      </section>
      {rede && tarefas.length ? (
        <section className="mt-6 space-y-3" aria-labelledby="outras-pendencias-titulo">
          <h2 id="outras-pendencias-titulo" className="text-lg font-bold">Pendências da franqueadora</h2>
          <ListaPendencias itens={tarefas} />
        </section>
      ) : null}
    </>
  )
}

function ListaPendencias({ itens }: { itens: Pendencia[] }) {
  if (!itens.length) return null
  return (
    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {itens.map((item) => (
        <li key={item.id}>
          <Link to={item.para} className="block rounded-2xl border border-line bg-surface p-4 hover:border-brand">
            <p className="mb-2 font-semibold">{item.titulo}</p>
            <Selo tom={item.tom === 'alerta' ? 'alerta' : 'neutro'}>{item.detalhe}</Selo>
          </Link>
        </li>
      ))}
    </ul>
  )
}
