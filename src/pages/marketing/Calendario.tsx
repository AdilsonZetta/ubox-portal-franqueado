import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Aviso, Button, Carregando, Selo, Vazio } from '../../components/ui'
import { formatarDia } from '../../lib/format'
import { ROTULO_CAMPANHA, campanhasDoMes, situacaoCampanha } from '../../lib/marketing'
import { useMarketing } from './useMarketing'

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

export function CalendarioMarketingPage() {
  const dados = useMarketing()
  const hoje = new Date()
  const [ano, setAno] = useState(hoje.getFullYear())
  const [mes, setMes] = useState(hoje.getMonth())
  const agora = Date.now()
  const doMes = campanhasDoMes(dados.campanhas.filter((c) => c.ativo || dados.gestor), ano, mes)
  const materiaisPorCampanha = new Map<string, number>()
  for (const m of dados.materiais) if (m.campanhaId) materiaisPorCampanha.set(m.campanhaId, (materiaisPorCampanha.get(m.campanhaId) ?? 0) + 1)

  function mover(delta: number) {
    const d = new Date(ano, mes + delta, 1)
    setAno(d.getFullYear())
    setMes(d.getMonth())
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <p className="text-sm text-ink/50">
        <Link to="/marketing">Central de Marketing</Link> / Calendário
      </p>
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-extrabold">Calendário de campanhas</h1>
          <p className="mt-1 text-sm text-ink/65">Campanhas da rede, datas comemorativas e lançamentos. Planeje as postagens da unidade com antecedência.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="secondary" aria-label="Mês anterior" onClick={() => mover(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="min-w-36 text-center font-bold" aria-live="polite">{MESES[mes]} de {ano}</span>
          <Button type="button" variant="secondary" aria-label="Próximo mês" onClick={() => mover(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
      </header>
      {dados.erro ? <Aviso tom="erro">{dados.erro}</Aviso> : null}
      {dados.carregando ? <Carregando texto="Carregando o calendário…" /> : null}
      {!dados.carregando && !doMes.length ? <Vazio titulo="Nada neste mês" texto="Nenhuma campanha ou data comemorativa cadastrada para este mês." /> : null}
      <ol className="space-y-3">
        {doMes.map((c) => {
          const situacao = situacaoCampanha(c, agora)
          const qtd = materiaisPorCampanha.get(c.id) ?? 0
          const inicio = new Date(c.inicioMs)
          return (
            <li key={c.id} className="flex gap-4 rounded-2xl border border-line bg-white p-4 shadow-sm">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-brand/10 text-center text-brand-dark">
                <span className="text-xl font-black leading-none">{inicio.getDate()}</span>
                <span className="text-[10px] font-bold uppercase">{MESES[inicio.getMonth()].slice(0, 3)}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap gap-1.5">
                  <Selo tom="marca">{ROTULO_CAMPANHA[c.tipo]}</Selo>
                  <Selo tom={situacao === 'em_andamento' ? 'lima' : situacao === 'em_breve' ? 'neutro' : 'alerta'}>
                    {situacao === 'em_andamento' ? 'Em andamento' : situacao === 'em_breve' ? 'Em breve' : 'Encerrada'}
                  </Selo>
                  {!c.ativo ? <Selo tom="alerta">Inativa</Selo> : null}
                </div>
                <h2 className="mt-1 font-bold">{c.titulo}</h2>
                <p className="text-xs text-ink/55">{formatarDia(c.inicioMs)} a {formatarDia(c.fimMs)}</p>
                {c.descricao ? <p className="mt-1 text-sm text-ink/65">{c.descricao}</p> : null}
                {qtd ? (
                  <Link to="/marketing" className="mt-1 inline-block text-xs font-semibold text-brand-dark hover:underline">
                    {qtd} material{qtd === 1 ? '' : 'is'} desta campanha
                  </Link>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
