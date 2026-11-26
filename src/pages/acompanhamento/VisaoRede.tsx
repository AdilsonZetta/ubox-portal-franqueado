import { BotaoCsv } from '../../components/BotaoCsv'
import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Search } from 'lucide-react'
import { Aviso, Button, Carregando, Vazio, cx, inputClass } from '../../components/ui'
import { mensagemErro } from '../../lib/errors'
import { formatarDia } from '../../lib/format'
import { listarUnidades } from '../../lib/gestao'
import {
  ORDEM_CLASSIFICACAO, ROTULO_CLASSIFICACAO, ROTULO_FONTE, contarClassificacoes,
  estadoDasFontes, fontesIndisponiveis, motivoSaude, resumirUnidade, saudeDe, sinaisSaude, type Classificacao,
} from '../../lib/acompanhamento'
import { carregarAcompanhamento, type DadosAcompanhamento } from '../../lib/acompanhamentoApi'
import type { Unidade } from '../../types'
import { ScoreSelo } from '../checklist/partes'
import { COR_NIVEL, CriteriosSaude, SaudeSelo, useAcessoAcompanhamento } from './partes'

export function VisaoRedePage() {
  const { gestor } = useAcessoAcompanhamento()
  const [unidades, setUnidades] = useState<Unidade[]>([])
  const [dados, setDados] = useState<DadosAcompanhamento | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [tique, setTique] = useState(0)
  const [busca, setBusca] = useState('')
  const [cidade, setCidade] = useState('')
  const [nivel, setNivel] = useState<Classificacao | ''>('')

  useEffect(() => {
    if (!gestor) return
    let ativo = true
    setCarregando(true)
    setErro('')
    void Promise.all([listarUnidades(), carregarAcompanhamento()])
      .then(([u, d]) => {
        if (!ativo) return
        setUnidades(u.filter((x) => x.ativo))
        setDados(d)
      })
      .catch((falha) => ativo && setErro(mensagemErro(falha)))
      .finally(() => ativo && setCarregando(false))
    return () => {
      ativo = false
    }
  }, [gestor, tique])

  const linhas = useMemo(() => {
    if (!dados) return []
    const agora = Date.now()
    return unidades.map((u) => {
      const resumo = resumirUnidade(u, dados.fontes, agora, dados.vigenciasChecklist)
      const sinais = sinaisSaude(resumo, agora)
      return { u, resumo, sinais, saude: saudeDe(sinais), motivo: motivoSaude(sinais) }
    })
  }, [unidades, dados])

  if (!gestor) return <Navigate to="/" replace />
  const cidades = [...new Set(unidades.map((u) => u.cidade).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pt-BR'))
  const contagem = contarClassificacoes(linhas.map((l) => l.saude))
  const filtradas = linhas
    .filter((l) => (!nivel || l.saude === nivel) && (!cidade || l.u.cidade === cidade) && (!busca.trim() || l.u.nome.toLowerCase().includes(busca.trim().toLowerCase())))
    .sort((a, b) => ORDEM_CLASSIFICACAO.indexOf(a.saude) - ORDEM_CLASSIFICACAO.indexOf(b.saude) || a.u.nome.localeCompare(b.u.nome, 'pt-BR'))
  const indisponiveis = dados ? fontesIndisponiveis(estadoDasFontes(dados.fontes)).map((fonte) => ROTULO_FONTE[fonte]) : []

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-ink/40">Acompanhamento do Franqueado · Franqueadora</p>
        <h1 className="text-2xl font-black text-ink">Visão da rede</h1>
        <p className="mt-0.5 max-w-3xl text-sm text-ink/65">Saúde de cada unidade a partir do checklist, das auditorias, dos chamados e dos combinados com a franqueadora. Clique em uma unidade para ver o painel completo e registrar visitas e reuniões.</p>
      </header>
      {erro ? <Aviso tom="erro"><span role="alert">{erro}</span> <Button variant="ghost" onClick={() => setTique((t) => t + 1)}>Tentar novamente</Button></Aviso> : null}
      {!carregando && !erro && indisponiveis.length ? <Aviso tom="info"><span role="status">Fontes indisponíveis: {indisponiveis.join(', ')}.</span> <Button variant="ghost" onClick={() => setTique((t) => t + 1)}>Tentar novamente</Button></Aviso> : null}
      {carregando ? <Carregando texto="Reunindo os dados da rede…" /> : null}
      {!carregando && !erro ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {ORDEM_CLASSIFICACAO.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={nivel === n}
                onClick={() => setNivel(nivel === n ? '' : n)}
                className={cx('flex items-center justify-between gap-2 rounded-2xl border bg-white p-4 text-left shadow-sm', nivel === n ? 'border-ink' : 'border-line hover:border-ink/30')}
              >
                <span className="flex items-center gap-2 text-sm font-semibold"><span className={cx('h-3 w-3 shrink-0 rounded-full', COR_NIVEL[n])} aria-hidden="true" />{ROTULO_CLASSIFICACAO[n]}</span>
                <span className="text-2xl font-black tabular-nums">{contagem[n]}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <label className="relative block w-64 text-sm">
              <span className="sr-only">Buscar unidade</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink/35" aria-hidden="true" />
              <input className={cx(inputClass, 'pl-9')} placeholder="Buscar unidade" value={busca} onChange={(e) => setBusca(e.target.value)} />
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Cidade</span>
              <select className={inputClass} value={cidade} onChange={(e) => setCidade(e.target.value)}>
                <option value="">Todas</option>
                {cidades.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="block space-y-1 text-sm">
              <span className="font-medium">Saúde</span>
              <select className={inputClass} value={nivel} onChange={(e) => setNivel(e.target.value as Classificacao | '')}>
                <option value="">Todas</option>
                {ORDEM_CLASSIFICACAO.map((n) => <option key={n} value={n}>{ROTULO_CLASSIFICACAO[n]}</option>)}
              </select>
            </label>
          </div>
          <BotaoCsv arquivo="acompanhamento-rede" cabecalhos={['Unidade', 'Cidade', 'Saúde', 'Média checklist', 'Score auditoria', 'Chamados abertos']}
            linhas={filtradas.map(({ u, saude, resumo }) => [u.nome, u.cidade, ROTULO_CLASSIFICACAO[saude], resumo.checklist.aplica ? resumo.checklist.media : null,
              resumo.auditoria.ultima?.score, resumo.chamados?.abertos])} />
          <CriteriosSaude />
          {!filtradas.length ? <Vazio titulo={linhas.length ? 'Nenhum resultado para este filtro' : 'Nenhuma unidade'} texto="Ajuste os filtros ou cadastre unidades na gestão da franqueadora." /> : null}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filtradas.map(({ u, resumo, sinais, saude, motivo }) => (
              <Link key={u.id} to={`/acompanhamento/unidade/${u.id}`} className="block rounded-2xl border border-line bg-white p-4 shadow-sm transition-colors hover:border-brand/50 motion-reduce:transition-none">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{u.nome}</p>
                    <p className="text-xs text-ink/50">{u.cidade || '—'} · último contato {!resumo.contatoDisponivel ? 'indisponível' : resumo.ultimoContatoMs === null ? 'sem registro' : formatarDia(resumo.ultimoContatoMs)}</p>
                  </div>
                  <SaudeSelo nivel={saude} />
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div><dt className="text-ink/50">Checklist</dt><dd className="mt-0.5">{resumo.checklist.aplica && resumo.checklist.media !== null ? <ScoreSelo score={resumo.checklist.media} /> : <span className="text-ink/40">—</span>}</dd></div>
                  <div><dt className="text-ink/50">Auditoria</dt><dd className="mt-0.5 font-semibold">{resumo.auditoria.ultima ? `${resumo.auditoria.ultima.score}% ${resumo.auditoria.ultima.resultado === 'aprovada' ? '✓' : '✗'}` : '—'}</dd></div>
                  <div><dt className="text-ink/50">Chamados</dt><dd className="mt-0.5 font-semibold">{resumo.chamados ? `${resumo.chamados.abertos} abertos` : '—'}</dd></div>
                </dl>
                {motivo.sinaisIndisponiveis.length ? (
                  <p className="mt-3 text-xs text-ink-soft"><span className="font-semibold">Sinais indisponíveis:</span> {motivo.sinaisIndisponiveis.join(', ')}.</p>
                ) : null}
                {motivo.riscosConfirmados.length ? (
                  <p className="mt-2 text-xs text-ink-soft"><span className="font-semibold">Sinais de risco:</span> {motivo.riscosConfirmados.map((s) => s.rotulo).join(', ')}.</p>
                ) : null}
                <div className="mt-3 flex gap-1" aria-hidden="true">
                  {sinais.map((s) => <span key={s.chave} title={`${s.rotulo}: ${s.detalhe}`} className={cx('h-1.5 flex-1 rounded-full', COR_NIVEL[s.nivel])} />)}
                </div>
              </Link>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}
