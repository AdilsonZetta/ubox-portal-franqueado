import { Link } from 'react-router-dom'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import { Selo, Vazio, cx } from '../../components/ui'
import { formatarData } from '../../lib/format'
import { linkHttpsValido } from '../../lib/marketing'
import {
  ROTULO_SITUACAO,
  faixaScore,
  totaisConferem,
  type ExecucaoChecklist,
  type NaoConformidade,
  type Situacao,
} from '../../lib/checklist'

const COR_FAIXA = {
  bom: 'bg-lime/25 text-lime-dark',
  atencao: 'bg-amber-100 text-amber-900',
  critico: 'bg-red-100 text-red-800',
}

export function ScoreSelo({ score, grande = false }: { score: number; grande?: boolean }) {
  return (
    <span className={cx('inline-flex items-center rounded-full font-black tabular-nums', COR_FAIXA[faixaScore(score)], grande ? 'px-4 py-1.5 text-2xl' : 'px-2.5 py-0.5 text-sm')}>
      {score}%
    </span>
  )
}

export function SituacaoSelo({ situacao }: { situacao: Situacao }) {
  if (situacao === 'atrasado') return <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-800">{ROTULO_SITUACAO[situacao]}</span>
  return <Selo tom={situacao === 'em_dia' ? 'lima' : situacao === 'pendente' ? 'alerta' : 'neutro'}>{ROTULO_SITUACAO[situacao]}</Selo>
}

/** Link externo só se for https (evidências vêm da unidade). */
export function LinkEvidencia({ url, rotulo = 'Evidência' }: { url: string; rotulo?: string }) {
  if (!url) return null
  if (!linkHttpsValido(url)) return <span className="text-xs text-ink/45">(link inválido)</span>
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-dark hover:underline">
      {rotulo} <ExternalLink className="h-3 w-3" aria-hidden="true" />
    </a>
  )
}

export function ListaExecucoes({ execucoes, mostrarUnidade = false }: { execucoes: ExecucaoChecklist[]; mostrarUnidade?: boolean }) {
  if (!execucoes.length) return <Vazio titulo="Nenhum checklist encontrado" texto="Quando um checklist for enviado, ele aparece aqui." />
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-paper text-xs uppercase tracking-wide text-ink/50">
          <tr>
            <th className="px-4 py-2.5 font-semibold">Data</th>
            <th className="px-4 py-2.5 font-semibold">Checklist</th>
            {mostrarUnidade ? <th className="px-4 py-2.5 font-semibold">Unidade</th> : null}
            <th className="px-4 py-2.5 font-semibold">Quem fez</th>
            <th className="px-4 py-2.5 font-semibold">Não conf.</th>
            <th className="px-4 py-2.5 font-semibold">Score</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {execucoes.map((e) => (
            <tr key={e.id} className="hover:bg-paper/60">
              <td className="whitespace-nowrap px-4 py-2.5 text-ink/70">
                <Link to={`/checklist/execucao/${e.id}`} className="font-medium text-ink hover:text-brand-dark hover:underline">{formatarData(e.criadoEmMs)}</Link>
              </td>
              <td className="px-4 py-2.5">{e.modeloTitulo}</td>
              {mostrarUnidade ? <td className="px-4 py-2.5">{e.unidadeNome || e.unidadeId}</td> : null}
              <td className="px-4 py-2.5 text-ink/70">{e.nome}</td>
              <td className="px-4 py-2.5">{e.qtdNaoOk ? <span className="font-semibold text-red-700">{e.qtdNaoOk}</span> : <span className="text-ink/40">0</span>}</td>
              <td className="px-4 py-2.5">
                <span className="inline-flex items-center gap-1.5">
                  <ScoreSelo score={e.score} />
                  {!totaisConferem(e) ? <AlertTriangle className="h-4 w-4 text-red-600" aria-label="Totais não conferem com as respostas" /> : null}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function ListaNaoConformidades({ itens, mostrarUnidade = false }: { itens: NaoConformidade[]; mostrarUnidade?: boolean }) {
  if (!itens.length) return <Vazio titulo="Nenhuma não conformidade" texto="Itens marcados como Não OK nos checklists aparecem aqui." />
  return (
    <ul className="space-y-2">
      {itens.map((nc, i) => (
        <li key={`${nc.execucaoId}-${i}`} className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold">{nc.texto}</p>
              <p className="text-xs text-ink/55">
                {nc.modeloTitulo}{nc.secao ? ` · ${nc.secao}` : ''}{mostrarUnidade ? ` · ${nc.unidadeNome || nc.unidadeId}` : ''} · {nc.nome} · {formatarData(nc.criadoEmMs)}
              </p>
            </div>
            <Link to={`/checklist/execucao/${nc.execucaoId}`} className="text-xs font-semibold text-brand-dark hover:underline">Ver checklist</Link>
          </div>
          {nc.obs ? <p className="mt-1.5 text-sm text-ink/75">{nc.obs}</p> : null}
          <div className="mt-1"><LinkEvidencia url={nc.evidenciaUrl} /></div>
        </li>
      ))}
    </ul>
  )
}

export function RodapeModulo7() {
  return <p className="text-center text-[11px] text-ink/35">Módulo 7 construído e revisado pelo Grok Bot no Cursor (o Antigravity estava sem cota nesta rodada).</p>
}
