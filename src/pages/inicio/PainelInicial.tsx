import { useAuth } from '../../lib/auth'
import { useVisao } from '../../lib/visao'
import { EscolhaUnidade } from './EscolhaUnidade'
import { PainelRede } from './PainelRede'
import { PainelUnidadeInicio } from './PainelUnidadeInicio'

export function PainelInicial() {
  const { user } = useAuth()
  const { ehAdmin, comoFranqueado, simulado } = useVisao()
  const pessoa = comoFranqueado ? simulado : user
  if (!pessoa) return comoFranqueado ? <EscolhaUnidade /> : null
  const rede = ehAdmin || pessoa.papel === 'equipe_franqueadora'
  const pessoal = pessoa.papel === 'equipe_franqueado'
  return (
    <section className="mt-6 space-y-4" aria-labelledby="painel-inicial-titulo">
      <h2 id="painel-inicial-titulo" className="text-xl font-bold tracking-tight">
        {rede ? 'Visão da rede' : pessoal ? 'Meu dia' : 'Painel da unidade'}
      </h2>
      {rede
        ? <PainelRede key={pessoa.uid} pessoa={pessoa} />
        : <PainelUnidadeInicio key={JSON.stringify([pessoa.uid, pessoa.unidadeId, comoFranqueado, pessoal])} pessoa={pessoa} />}
    </section>
  )
}
