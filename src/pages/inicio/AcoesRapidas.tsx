import { useEffect, useState, type ReactNode } from 'react'
import { BookOpen, ClipboardCheck, MessageSquarePlus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Aviso, Button, Carregando } from '../../components/ui'
import { dataLocalMs, inicioHistoricoVigencias, inicioPeriodo, ROTULO_PERIODO } from '../../lib/checklist'
import { listarExecucoes, listarModelos, listarVigencias } from '../../lib/checklistApi'
import { formatarDia } from '../../lib/format'
import { acoesPermitidas, escolherRotina } from '../../lib/inicioUnidade'
import { listarMeuProgresso, listarTrilhaManuais } from '../../lib/manuaisApi'
import { montarTrilhaDoUsuario, proximoManual } from '../../lib/manuaisTrilha'
import { useAuth } from '../../lib/auth'
import { useVisao } from '../../lib/visao'
import { useRelogioChecklist } from '../checklist/useChecklist'

const atalhos = {
  checklist: { titulo: 'Fazer checklist de hoje', destino: '/checklist', Icone: ClipboardCheck },
  chamados: { titulo: 'Abrir chamado', destino: '/chamados?novo=1', Icone: MessageSquarePlus },
  manuais: { titulo: 'Continuar treinamento', destino: '/manuais/trilha', Icone: BookOpen },
  universidade: { titulo: 'Continuar treinamento', destino: '/universidade', Icone: BookOpen },
}

export function AcoesRapidas() {
  const { user } = useAuth()
  const { comoFranqueado, simulado } = useVisao()
  const pessoa = comoFranqueado ? simulado : user
  const acoes = acoesPermitidas(pessoa, comoFranqueado)
  if (!pessoa || !acoes.length) return null

  return (
    <section className="mt-6 space-y-3" aria-labelledby="acoes-inicio-titulo">
      <h2 className="text-lg font-bold" id="acoes-inicio-titulo">Ações da unidade</h2>
      {comoFranqueado ? <Aviso>Na simulação, os atalhos mostram as ações liberadas para a unidade. O andamento das tarefas fica oculto.</Aviso> : null}
      <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {acoes.map((acao) => {
          const { titulo, destino, Icone } = atalhos[acao]
          return (
            <li key={acao} className="flex min-w-0 items-start gap-3 rounded-2xl border border-line bg-surface p-4 shadow-sm">
              <span className="icone-modulo grid size-10 shrink-0 place-items-center rounded-[10px]"><Icone className="size-5" aria-hidden="true" /></span>
              <div className="min-w-0 space-y-1">
                <h3 className="font-bold">{titulo}</h3>
                {!comoFranqueado && acao === 'checklist' ? <AtalhoChecklist key={`${pessoa.uid}:${pessoa.unidadeId}`} unidadeId={pessoa.unidadeId ?? ''} />
                  : !comoFranqueado && acao === 'manuais' ? <AtalhoManuais key={pessoa.uid} uid={pessoa.uid} />
                    : <Atalho to={destino}>{acao === 'chamados' ? 'Novo chamado' : acao === 'checklist' ? 'Ver checklist' : 'Ver treinamento'}</Atalho>}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function Atalho({ to, children }: { to: string; children: ReactNode }) {
  return <Link className="inline-block text-sm font-semibold text-brand-dark hover:underline" to={to}>{children}</Link>
}

async function carregarRotinas(unidadeId: string) {
  const unidade = { unidadeId }
  const agora = Date.now()
  const [modelos, vigencias] = await Promise.all([listarModelos(unidade, false), listarVigencias(unidade, false)])
  const execucoes = await listarExecucoes(unidade, false, {
    deMs: inicioHistoricoVigencias(vigencias, modelos, agora, inicioPeriodo('diaria', agora) - 62 * 86_400_000),
    maximo: vigencias.length ? Infinity : undefined,
  })
  return { modelos, execucoes, vigencias }
}

function AtalhoChecklist({ unidadeId }: { unidadeId: string }) {
  const agora = useRelogioChecklist()
  const [tentativa, setTentativa] = useState(0)
  const [dados, setDados] = useState<Awaited<ReturnType<typeof carregarRotinas>> | 'erro' | null>(null)
  useEffect(() => {
    let ativo = true
    void carregarRotinas(unidadeId)
      .then((r) => { if (ativo) setDados(r) })
      .catch(() => { if (ativo) setDados('erro') })
    return () => { ativo = false }
  }, [unidadeId, tentativa])

  if (!dados) return <Carregando texto="Consultando a rotina…" />
  if (dados === 'erro') return (
    <>
      <Aviso tom="erro"><span role="alert">Não foi possível consultar a rotina.</span> <Button variant="ghost" onClick={() => { setDados(null); setTentativa((t) => t + 1) }}>Tentar novamente</Button></Aviso>
      <Atalho to="/checklist">Ver checklist</Atalho>
    </>
  )
  const rotina = escolherRotina(dados.modelos, dados.execucoes, dados.vigencias, unidadeId, new Date(agora))
  if (rotina.estado === 'sem_rotina') return <><p className="text-sm text-ink-soft">Nenhuma rotina recorrente para esta unidade.</p><Atalho to="/checklist">Ver checklist</Atalho></>

  const { modelo } = rotina
  const periodo = modelo.frequencia === 'avulsa' ? '' : ROTULO_PERIODO[modelo.frequencia]
  return (
    <>
      <p className="break-words text-sm font-medium text-ink-soft">{modelo.titulo}</p>
      {rotina.estado === 'aguardando_inicio' ? <p className="text-sm text-muted">A rotina começa em {formatarDia(dataLocalMs(rotina.inicio), 'short')}.</p> : null}
      {rotina.estado === 'aguardando_horario' ? <p className="text-sm text-muted">Disponível a partir de {rotina.horario} (horário de Brasília).</p> : null}
      {rotina.estado === 'em_dia' ? (
        <>
          <p className="text-sm text-muted">
            {rotina.periodoInicial ? 'A rotina do período inicial já foi concluída.'
              : `A rotina já foi concluída ${periodo}.${modelo.frequencia === 'diaria' ? ' A próxima é amanhã.' : ''}`}
          </p>
          <Atalho to="/checklist">Ver checklist</Atalho>
        </>
      ) : null}
      {rotina.estado === 'atrasado' || rotina.estado === 'pendente' ? (
        <Atalho to={`/checklist/preencher/${encodeURIComponent(modelo.id)}`}>{rotina.estado === 'atrasado' ? 'Abrir rotina em atraso' : 'Preencher checklist'}</Atalho>
      ) : null}
    </>
  )
}

function AtalhoManuais({ uid }: { uid: string }) {
  const [tentativa, setTentativa] = useState(0)
  const [manual, setManual] = useState<{ titulo: string; documentoId: string } | 'em_dia' | 'bloqueada' | 'erro' | null>(null)
  useEffect(() => {
    let ativo = true
    void Promise.all([listarTrilhaManuais(), listarMeuProgresso(uid)])
      .then(([trilha, progresso]) => {
        if (!ativo) return
        const itens = montarTrilhaDoUsuario(trilha, progresso).flatMap((e) => e.itens)
        const proximo = proximoManual(itens)
        setManual(proximo ?? (itens.some((item) => item.estado === 'bloqueado') ? 'bloqueada' : 'em_dia'))
      })
      .catch(() => { if (ativo) setManual('erro') })
    return () => { ativo = false }
  }, [uid, tentativa])

  if (!manual) return <Carregando texto="Consultando a trilha…" />
  if (typeof manual === 'object') return <Atalho to={`/manuais/estudo/${encodeURIComponent(manual.documentoId)}`}>{manual.titulo}</Atalho>
  return (
    <>
      {manual === 'em_dia' ? <p className="text-sm text-muted">Trilha em dia</p> : null}
      {manual === 'bloqueada' ? <p className="text-sm text-muted">As próximas leituras dependem da conclusão de um manual anterior.</p> : null}
      {manual === 'erro' ? (
        <Aviso tom="erro"><span role="alert">Não foi possível consultar a trilha.</span> <Button variant="ghost" onClick={() => { setManual(null); setTentativa((t) => t + 1) }}>Tentar novamente</Button></Aviso>
      ) : null}
      <Atalho to="/manuais/trilha">Ver trilha de manuais</Atalho>
    </>
  )
}
