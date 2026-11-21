import { useState } from 'react'
import { BotaoCsv } from '../../components/BotaoCsv'
import { Campo, Vazio, inputClass } from '../../components/ui'
import type { ExecucaoChecklist } from '../../lib/checklist'
import { formatarData } from '../../lib/format'
import { normalizar } from '../../lib/text'
import { ListaExecucoes } from './partes'

export function ListaHistorico({ execucoes, mostrarUnidade = false }: { execucoes: ExecucaoChecklist[]; mostrarUnidade?: boolean }) {
  const [busca, setBusca] = useState('')
  const [ordem, setOrdem] = useState('recentes')
  const consulta = normalizar(busca.trim())
  const lista = execucoes
    .filter((e) => normalizar([e.modeloTitulo, e.nome, mostrarUnidade ? e.unidadeNome : ''].join(' ')).includes(consulta))
    .sort((a, b) => (ordem === 'score' ? b.score - a.score : 0) || b.criadoEmMs - a.criadoEmMs)
  return (
    <>
      <div className="flex flex-wrap items-end gap-3">
        <Campo label="Buscar no histórico"><input className={inputClass} value={busca} onChange={(e) => setBusca(e.target.value)} /></Campo>
        <Campo label="Ordenar por">
          <select className={inputClass} value={ordem} onChange={(e) => setOrdem(e.target.value)}>
            <option value="recentes">Mais recentes</option>
            <option value="score">Maior score</option>
          </select>
        </Campo>
        <BotaoCsv arquivo="historico-checklists"
          cabecalhos={['Data', 'Checklist', ...(mostrarUnidade ? ['Unidade'] : []), 'Quem fez', 'Não conformidades', 'Score (%)']}
          linhas={lista.map((e) => [formatarData(e.criadoEmMs), e.modeloTitulo, ...(mostrarUnidade ? [e.unidadeNome || e.unidadeId] : []),
            e.nome, e.qtdNaoOk, e.score])} />
      </div>
      {lista.length ? <ListaExecucoes execucoes={lista} mostrarUnidade={mostrarUnidade} /> : (
        <Vazio
          titulo={execucoes.length ? 'Nenhum resultado para este filtro' : 'Nenhum checklist encontrado'}
          texto={execucoes.length ? 'Ajuste a busca ou a ordenação.' : 'Quando um checklist for enviado no período, ele aparece aqui.'}
        />
      )}
    </>
  )
}
