import { Link } from 'react-router-dom'
import { Selo, Vazio, cx } from '../../components/ui'
import { formatarData, formatarDia } from '../../lib/format'
import {
  ROTULO_MODALIDADE,
  ROTULO_STATUS_ACAO,
  ROTULO_STATUS_AUD,
  acaoAtrasada,
  type Auditoria,
  type StatusAcao,
  type StatusAuditoria,
} from '../../lib/auditoria'
import { ScoreSelo } from '../checklist/partes'

export function ResultadoSelo({ resultado, grande = false }: { resultado: 'aprovada' | 'reprovada'; grande?: boolean }) {
  return (
    <span
      className={cx(
        'inline-flex rounded-full font-bold uppercase tracking-wide',
        resultado === 'aprovada' ? 'bg-lime/25 text-lime-dark' : 'bg-red-100 text-red-800',
        grande ? 'px-4 py-1.5 text-sm' : 'px-2 py-0.5 text-[11px]',
      )}
    >
      {resultado === 'aprovada' ? 'Aprovada' : 'Reprovada'}
    </span>
  )
}

export function StatusAudSelo({ status }: { status: StatusAuditoria }) {
  return <Selo tom={status === 'concluida' ? 'lima' : status === 'aguardando_ciencia' ? 'alerta' : 'neutro'}>{ROTULO_STATUS_AUD[status]}</Selo>
}

export function StatusAcaoSelo({ status, prazoMs }: { status: StatusAcao; prazoMs?: number }) {
  if (prazoMs !== undefined && acaoAtrasada({ status, prazoMs }, Date.now()))
    return <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-red-800">Atrasada · {ROTULO_STATUS_ACAO[status]}</span>
  return <Selo tom={status === 'validada' ? 'lima' : status === 'concluida_unidade' ? 'marca' : 'alerta'}>{ROTULO_STATUS_ACAO[status]}</Selo>
}

export function ListaAuditorias({ auditorias, mostrarUnidade = false, vazio }: { auditorias: Auditoria[]; mostrarUnidade?: boolean; vazio?: string }) {
  if (!auditorias.length) return <Vazio titulo="Nenhuma auditoria encontrada" texto={vazio ?? 'As auditorias aparecem aqui depois de assinadas pelo auditor.'} />
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="w-full text-left text-sm">
        <thead className="bg-paper text-xs uppercase tracking-wide text-ink/50">
          <tr>
            <th className="px-4 py-2.5 font-semibold">Data</th>
            {mostrarUnidade ? <th className="px-4 py-2.5 font-semibold">Unidade</th> : null}
            <th className="px-4 py-2.5 font-semibold">Auditoria</th>
            <th className="px-4 py-2.5 font-semibold">Auditor</th>
            <th className="px-4 py-2.5 font-semibold">Situação</th>
            <th className="px-4 py-2.5 font-semibold">Score</th>
            <th className="px-4 py-2.5 font-semibold">Resultado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {auditorias.map((a) => (
            <tr key={a.id} className="hover:bg-paper/60">
              <td className="whitespace-nowrap px-4 py-2.5">
                <Link to={a.status === 'rascunho' ? `/auditoria/editar/${a.id}` : `/auditorias/${a.id}`} className="font-medium text-ink hover:text-brand-dark hover:underline">
                  {formatarDia(a.dataVisitaMs)}
                </Link>
              </td>
              {mostrarUnidade ? <td className="px-4 py-2.5">{a.unidadeNome || a.unidadeId}</td> : null}
              <td className="px-4 py-2.5">
                {a.modeloTitulo}
                <span className="block text-[11px] text-ink/50">{ROTULO_MODALIDADE[a.modalidade]}</span>
              </td>
              <td className="px-4 py-2.5 text-ink/70">{a.auditorNome}</td>
              <td className="px-4 py-2.5"><StatusAudSelo status={a.status} /></td>
              <td className="px-4 py-2.5"><ScoreSelo score={a.score} /></td>
              <td className="px-4 py-2.5">{a.status === 'rascunho' ? <span className="text-xs text-ink/40">—</span> : <ResultadoSelo resultado={a.resultado} />}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Unidades que o auditor pode escolher: o admin lê o cadastro; a equipe usa as unidades vistas nos checklists e auditorias. */
export function unidadesAuditaveis(cadastro: { id: string; nome: string }[], vistas: { unidadeId: string; unidadeNome: string }[]) {
  const mapa = new Map(cadastro.map(({ id, nome }) => [id, { id, nome }]))
  for (const v of vistas) if (v.unidadeId && !mapa.has(v.unidadeId)) mapa.set(v.unidadeId, { id: v.unidadeId, nome: v.unidadeNome || v.unidadeId })
  return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export function Assinatura({ titulo, nome, emMs, vazio }: { titulo: string; nome: string; emMs: number; vazio: string }) {
  return (
    <div className={cx('rounded-2xl border p-4', nome ? 'border-lime/50 bg-lime/10' : 'border-dashed border-line bg-white')}>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/50">{titulo}</p>
      {nome ? (
        <>
          <p className="mt-1 font-serif text-xl italic">{nome}</p>
          <p className="text-xs text-ink/55">Assinado em {formatarData(emMs)} (horário do servidor)</p>
        </>
      ) : (
        <p className="mt-1 text-sm text-ink/55">{vazio}</p>
      )}
    </div>
  )
}
