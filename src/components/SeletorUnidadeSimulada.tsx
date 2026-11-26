import { useVisao } from '../lib/visao'
import { Button, Campo, inputClass } from './ui'

export function SeletorUnidadeSimulada({ lateral = false }: { lateral?: boolean }) {
  const { simulado, unidadesSimulaveis, carregandoUnidades, erroUnidades, escolher, recarregarUnidades } = useVisao()
  if (carregandoUnidades) return <p role="status" className="text-sm">Carregando unidades…</p>
  if (erroUnidades) return (
    <div className="space-y-2 text-sm">
      <p role="alert">Não foi possível carregar as unidades.</p>
      <Button variant="secondary" onClick={recarregarUnidades}>Tentar novamente</Button>
    </div>
  )
  if (!unidadesSimulaveis.length) return <p className="text-sm">Nenhuma unidade com franqueado ativo está disponível. Confira o cadastro em Unidades e usuários.</p>

  const seletor = (
    <select
      aria-label={lateral ? 'Escolha a unidade' : undefined}
      className={lateral ? 'min-h-11 w-full rounded-xl border border-line-control bg-graphite px-3 py-2 text-sm' : inputClass}
      value={simulado?.uid ?? ''}
      onChange={(evento) => escolher(evento.target.value)}
    >
      <option value="">{lateral ? 'Escolha a unidade' : 'Selecione uma unidade'}</option>
      {unidadesSimulaveis.map((pessoa) => <option key={pessoa.uid} value={pessoa.uid}>{pessoa.unidade || pessoa.unidadeId}</option>)}
    </select>
  )
  return lateral ? seletor : <Campo label="Escolha a unidade">{seletor}</Campo>
}
