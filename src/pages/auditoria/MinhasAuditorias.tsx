import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Aviso, Button, Carregando, Vazio } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { formatarDia } from '../../lib/format'
import { daUnidade, resumoAcoes, type AcaoAuditoria, type Auditoria } from '../../lib/auditoria'
import { listarAcoes, listarAuditorias } from '../../lib/auditoriaApi'
import { useVisao } from '../../lib/visao'
import { ListaAuditorias, StatusAcaoSelo } from './partes'

/** Visão da unidade: as auditorias assinadas da própria unidade e o plano de ação. A equipe do franqueado só lê. */
export function MinhasAuditoriasPage() {
  const { user } = useAuth()
  const { comoFranqueado, simulado } = useVisao()
  const pessoa = comoFranqueado ? simulado : user
  const [auditorias, setAuditorias] = useState<Auditoria[]>([])
  const [acoes, setAcoes] = useState<AcaoAuditoria[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [tique, setTique] = useState(0)
  const unidadeId = pessoa?.unidadeId ?? ''

  useEffect(() => {
    if (!user || !daUnidade(pessoa) || !unidadeId) {
      setCarregando(false)
      return
    }
    let ativo = true
    setErro('')
    setCarregando(true)
    // Na simulação, o admin lê como franqueadora e filtra pela unidade simulada.
    const consulta = comoFranqueado
      ? Promise.all([listarAuditorias(true, null), listarAcoes(true, null)]).then(([a, ac]) => [
          a.filter((x) => x.unidadeId === unidadeId && x.status !== 'rascunho'),
          ac.filter((x) => x.unidadeId === unidadeId),
        ] as const)
      : Promise.all([listarAuditorias(false, unidadeId), listarAcoes(false, unidadeId)])
    void consulta
      .then(([a, ac]) => {
        if (!ativo) return
        setAuditorias([...a])
        setAcoes([...ac])
      })
      .catch((falha) => ativo && setErro(mensagemErro(falha)))
      .finally(() => ativo && setCarregando(false))
    return () => {
      ativo = false
    }
  }, [user, pessoa, unidadeId, comoFranqueado, tique])

  if (!user) return null
  const resumo = resumoAcoes(acoes, Date.now())
  const pendentes = acoes.filter((a) => ['aberta', 'em_andamento', 'reaberta'].includes(a.status))
  const aguardando = auditorias.filter((a) => a.status === 'aguardando_ciencia')

  return (
    <div className="space-y-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-wider text-ink/40">Auditoria e Qualidade</p>
        <h1 className="text-2xl font-black text-ink">Auditorias da unidade</h1>
        <p className="mt-0.5 max-w-2xl text-sm text-ink/65">
          Resultado das auditorias da franqueadora na sua unidade e o plano de ação de cada não conformidade.
          {pessoa?.papel === 'equipe_franqueado' ? ' Sua equipe acompanha em modo leitura; o franqueado assina a ciência e atualiza o plano.' : ''}
        </p>
      </header>
      {!daUnidade(pessoa) ? <Aviso tom="info">Esta página é para as unidades. A franqueadora usa a gestão de auditorias.</Aviso> : null}
      {daUnidade(pessoa) && !unidadeId ? <Aviso>Peça à franqueadora para vincular esta conta a uma unidade.</Aviso> : null}
      {comoFranqueado ? <Aviso>Simulação em modo de leitura. Assinaturas e alterações do plano ficam indisponíveis.</Aviso> : null}
      {erro ? <Aviso tom="erro"><span role="alert">{erro}</span> <Button variant="ghost" onClick={() => setTique((t) => t + 1)}>Tentar novamente</Button></Aviso> : null}
      {carregando ? <Carregando texto="Carregando auditorias…" /> : null}
      {!carregando && unidadeId && daUnidade(pessoa) && !erro ? (
        <>
          {aguardando.length ? (
            <Aviso tom="info">
              {aguardando.length === 1 ? 'Há 1 auditoria aguardando a ciência do franqueado.' : `Há ${aguardando.length} auditorias aguardando a ciência do franqueado.`}{' '}
              <Link className="font-semibold underline" to={`/auditorias/${aguardando[0].id}`}>Abrir</Link>
            </Aviso>
          ) : null}
          <ListaAuditorias auditorias={auditorias} vazio="Quando a franqueadora assinar uma auditoria da sua unidade, ela aparece aqui." />
          <section className="space-y-2">
            <h2 className="text-lg font-bold">Plano de ação</h2>
            <p className="text-sm text-ink/60">{resumo.abertas} em aberto · {resumo.atrasadas} atrasada(s) · {resumo.paraValidar} aguardando validação · {resumo.validadas} validada(s)</p>
            {!pendentes.length ? <Vazio titulo="Nada pendente" texto="As ações abertas pela franqueadora aparecem aqui." /> : null}
            <ul className="space-y-2">
              {pendentes.map((a) => (
                <li key={a.id} className="flex flex-wrap items-start justify-between gap-2 rounded-2xl border border-line bg-white p-4 shadow-sm">
                  <div className="min-w-0">
                    <p className="font-semibold">{a.descricao}</p>
                    <p className="text-xs text-ink/55">Item: {a.itemTexto || a.itemId} · responsável {a.responsavel} · prazo {formatarDia(a.prazoMs)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusAcaoSelo status={a.status} prazoMs={a.prazoMs} />
                    <Link to={`/auditorias/${a.auditoriaId}`} className="text-xs font-semibold text-brand-dark hover:underline">Atualizar</Link>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  )
}
