import { useState } from 'react'
import { Campo, inputClass } from '../../components/ui'
import type { PessoaUnidade, UnidadeDemanda } from '../../lib/demandasSupabase'
import { EstadoConsulta, type ConsultaDemandas } from './partes'

export function SelecionarUnidades({ consulta, selecionadas, alternar }: {
  consulta: ConsultaDemandas<UnidadeDemanda[]>; selecionadas: string[]; alternar: (id: string) => void
}) {
  const [busca, setBusca] = useState('')
  const normalizar = (texto: string) => texto.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
  const termo = normalizar(busca.trim())
  const opcoes = consulta.dados?.filter((u) => normalizar(u.nome).includes(termo))
  return (
    <fieldset className="space-y-2 rounded-xl border border-line p-3">
      <legend className="px-1 text-sm font-bold">Unidades</legend>
      <Campo label="Buscar unidade"><input name="busca-unidade" type="search" className={inputClass}
        value={busca} onChange={(e) => setBusca(e.target.value)} /></Campo>
      <p className="text-xs text-muted" aria-live="polite">{selecionadas.length} {selecionadas.length === 1 ? 'unidade selecionada' : 'unidades selecionadas'}</p>
      {consulta.erro || !opcoes ? <EstadoConsulta {...consulta} texto="Carregando unidades…" falha="Não foi possível carregar as unidades." />
        : opcoes.length ? <div className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
          {opcoes.map((u) => <OpcaoPessoa key={u.id} nome={u.nome} marcado={selecionadas.includes(u.id)} alternar={() => alternar(u.id)} />)}
        </div> : <p className="text-sm text-muted">{termo ? 'Nenhuma unidade corresponde à busca. Tente outro nome.' : 'Nenhuma unidade ativa disponível para envio.'}</p>}
    </fieldset>
  )
}

export function PessoasDasUnidades({ consulta, unidades, ids, alternar }: {
  consulta: ConsultaDemandas<PessoaUnidade[]>; unidades: UnidadeDemanda[]; ids: string[]; alternar: (pessoa: PessoaUnidade) => void
}) {
  return (
    <fieldset className="space-y-2 rounded-xl border border-line p-3">
      <legend className="px-1 text-sm font-bold">Pessoas da unidade</legend>
      <p className="text-sm text-muted">Sem ninguém marcado, a demanda vai para a unidade toda (o franqueado e a equipe veem).</p>
      {consulta.erro || !consulta.dados ? <EstadoConsulta {...consulta} texto="Carregando pessoas…" falha="Não foi possível carregar as pessoas das unidades." />
        : unidades.map((unidade) => {
          const pessoas = consulta.dados?.filter((p) => p.unidade_id === unidade.id) ?? []
          return <div key={unidade.id} className="rounded-lg border border-line p-2">
            <h3 className="px-2 py-1 text-sm font-bold">{unidade.nome}</h3>
            {pessoas.length ? <div className="grid max-h-48 gap-1 overflow-y-auto sm:grid-cols-2">
              {pessoas.map((pessoa) => <OpcaoPessoa key={pessoa.id} nome={pessoa.nome}
                detalhe={pessoa.papel === 'franqueado' ? 'Franqueado' : 'Equipe da unidade'}
                marcado={ids.includes(pessoa.id)} alternar={() => alternar(pessoa)} />)}
            </div> : <p className="px-2 text-sm text-muted">Nenhuma pessoa ativa. O envio será para a unidade toda.</p>}
          </div>
        })}
    </fieldset>
  )
}

export function OpcaoPessoa({ nome, detalhe, marcado, alternar }: {
  nome: string; detalhe?: string; marcado: boolean; alternar: () => void
}) {
  return <label className="flex min-h-10 items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-paper focus-within:bg-paper">
    <input type="checkbox" checked={marcado} onChange={alternar} />
    <span className="min-w-0 wrap-anywhere">{nome}{detalhe ? <span className="block text-xs text-muted">{detalhe}</span> : null}</span>
  </label>
}
