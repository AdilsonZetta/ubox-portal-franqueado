import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Award, BookOpen, CheckCircle2, ClipboardList, Lock, RotateCcw } from 'lucide-react'
import { Aviso, Button, Carregando, Selo } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { estadoDoManual, formatarDuracao } from '../../lib/manuaisTrilha'
import { podeModulo } from '../../lib/modulosAcesso'
import { usePortal } from '../../lib/portal'
import { MAX_TENTATIVAS } from '../../lib/universidade'
import { corrigirTentativa, emitirCertificadoCurso } from '../../lib/universidadeApi'
import { useVisao } from '../../lib/visao'
import { seloDoCurso } from './Universidade'
import { useUniversidade } from './useUniversidade'

export function CursoPage() {
  const { cursoId = '' } = useParams()
  const { user } = useAuth()
  const { comoFranqueado } = useVisao()
  const portal = usePortal()
  const dados = useUniversidade()
  const curso = dados.cursos.find((c) => c.id === cursoId)
  const prova = dados.provas.get(cursoId)
  const { recarregar } = dados
  const { atualizar } = portal
  const [tiqueCertificado, setTiqueCertificado] = useState(0)
  const [tiqueCorrecao, setTiqueCorrecao] = useState(0)
  const [erroCertificado, setErroCertificado] = useState('')
  const [erroCorrecao, setErroCorrecao] = useState('')
  const selo = curso ? seloDoCurso(curso, dados) : null
  const estado = selo?.estado ?? null
  const certificado = portal.certificados.find((c) => c.trilhaId === cursoId && c.uid === user?.uid)
  const proprio = dados.participa && !comoFranqueado
  const podeProcessar = proprio && !dados.erro
  const aprovadaId = estado?.tipo === 'aprovado' ? estado.tentativa.id : null
  const pendenteId = estado?.tipo === 'corrigindo' ? estado.tentativa.id : null

  const emissao = useRef<{ id: string; tique: number } | null>(null)
  const correcao = useRef<{ id: string; tique: number } | null>(null)

  useEffect(() => {
    if (!user || !curso || !podeProcessar || certificado || !aprovadaId) return
    if (emissao.current?.id === aprovadaId && emissao.current.tique === tiqueCertificado) return
    const operacao = { id: aprovadaId, tique: tiqueCertificado }
    emissao.current = operacao
    setErroCertificado('')
    void emitirCertificadoCurso(user, curso, aprovadaId)
      .catch(() => {
        if (emissao.current === operacao) setErroCertificado('Não foi possível confirmar a emissão do certificado.')
      })
      .finally(() => void atualizar())
  }, [user, curso, podeProcessar, certificado, aprovadaId, tiqueCertificado, atualizar])

  useEffect(() => {
    if (!podeProcessar || !pendenteId) return
    if (correcao.current?.id === pendenteId && correcao.current.tique === tiqueCorrecao) return
    const operacao = { id: pendenteId, tique: tiqueCorrecao }
    correcao.current = operacao
    setErroCorrecao('')
    void corrigirTentativa(pendenteId)
      .then(() => recarregar())
      .catch(() => {
        if (correcao.current === operacao) setErroCorrecao('Não foi possível corrigir sua última tentativa.')
      })
  }, [podeProcessar, pendenteId, tiqueCorrecao, recarregar])

  if (!user) return null
  if (dados.carregando) return <Carregando texto="Abrindo o curso…" />
  if (dados.erro) return <Aviso tom="erro"><p role="alert">{dados.erro}</p><Button type="button" variant="secondary" className="mt-2" onClick={dados.recarregar}>Tentar novamente</Button></Aviso>
  if (!curso) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Aviso tom="erro">Curso indisponível.</Aviso>
        <Link to="/universidade" className="text-sm font-semibold text-brand-dark">Voltar para os cursos</Link>
      </div>
    )
  }

  const itensTrilha = new Map(dados.trilha.map((i) => [i.documentoId, i]))
  const progressoPorDoc = new Map(dados.progressos.map((p) => [p.documentoId, p]))
  const aulasFeitas = selo?.feitas ?? 0
  const aulasCompletas = aulasFeitas >= curso.aulas.length
  const temManuais = podeModulo(dados.pessoa, 'manuais', comoFranqueado)
  const manualRetorno = prova ? itensTrilha.get(prova.manualRetornoId)?.titulo ?? portal.documentos.find((d) => d.id === prova.manualRetornoId)?.titulo ?? 'Manual indicado' : ''

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <p className="text-sm text-ink/50">
        <Link to="/universidade">Universidade UBOX</Link>
      </p>
      <div className="flex flex-wrap items-center gap-2">
        {selo ? <Selo tom={selo.tom}>{selo.rotulo}</Selo> : null}
      </div>
      <h1 className="text-3xl font-extrabold">{curso.titulo}</h1>
      <p className="text-ink/70">{curso.descricao}</p>

      {estado?.tipo === 'aprovado' ? (
        <Aviso tom="ok">
          Curso aprovado.{' '}
          {certificado ? (
            <Link to={`/certificado/${curso.id}`} className="font-semibold underline">Abrir certificado</Link>
          ) : (
            <span>{erroCertificado || 'O certificado está sendo emitido.'}{' '}
              {proprio ? <Button type="button" variant="secondary" onClick={() => {
                if (erroCertificado) setTiqueCertificado((t) => t + 1)
                else void atualizar()
              }}>{erroCertificado ? 'Tentar emitir novamente' : 'Atualizar certificado'}</Button> : null}
            </span>
          )}
        </Aviso>
      ) : null}
      {proprio && !temManuais ? <Aviso tom="erro">As aulas ficam no módulo Manuais e Processos, que não está liberado para você. Fale com o seu franqueado.</Aviso> : null}

      <section>
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink/45">Aulas</h2>
        {!curso.aulas.length ? <p className="text-sm text-ink/55">Este curso não tem aulas; a prova já está liberada.</p> : null}
        <ol className="space-y-3">
          {curso.aulas.map((documentoId, indice) => {
            const item = itensTrilha.get(documentoId)
            const titulo = item?.titulo ?? portal.documentos.find((d) => d.id === documentoId)?.titulo ?? 'Manual'
            const estadoAula = item ? estadoDoManual(item, progressoPorDoc) : progressoPorDoc.get(documentoId)?.status === 'concluido' ? 'concluido' : 'bloqueado'
            const conteudo = (
              <>
                <span className="grid h-8 w-8 place-items-center rounded-full bg-ink text-sm font-bold text-white">{indice + 1}</span>
                <span className="flex-1">
                  <span className="block font-semibold">{titulo}</span>
                  <span className="text-xs text-ink/50">
                    Manual da trilha{item ? ` · tempo mínimo ${formatarDuracao(item.tempoMinimoSeg)}` : ' · fora da trilha de manuais'}
                  </span>
                </span>
                {estadoAula === 'concluido' ? (
                  <Selo tom="lima"><CheckCircle2 className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Concluída</Selo>
                ) : estadoAula === 'bloqueado' ? (
                  <Selo><Lock className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />Bloqueada</Selo>
                ) : estadoAula === 'em_andamento' ? (
                  <Selo tom="alerta">Em andamento</Selo>
                ) : (
                  <Selo tom="marca">Disponível</Selo>
                )}
              </>
            )
            return (
              <li key={documentoId}>
                {item && (estadoAula !== 'bloqueado' || !proprio) && temManuais ? (
                  <Link to={`/manuais/estudo/${documentoId}`} className="flex items-center gap-4 rounded-2xl border border-line bg-white p-4 hover:border-brand">{conteudo}</Link>
                ) : (
                  <div className="flex items-center gap-4 rounded-2xl border border-line bg-white p-4 opacity-80">{conteudo}</div>
                )}
              </li>
            )
          })}
        </ol>
        {proprio && curso.aulas.some((id) => itensTrilha.get(id) && estadoDoManual(itensTrilha.get(id)!, progressoPorDoc) === 'bloqueado') ? (
          <p className="mt-2 text-xs text-ink/50">Aulas bloqueadas abrem na ordem da trilha de manuais.</p>
        ) : null}
      </section>

      <section className="rounded-3xl border border-line bg-white p-5 shadow-sm">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <ClipboardList className="h-5 w-5 text-brand" aria-hidden="true" /> Prova
        </h2>
        {!prova ? (
          <p className="mt-2 text-sm text-ink/60">A prova deste curso ainda não foi publicada.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-ink/60">
              {prova.totalPerguntas} pergunta{prova.totalPerguntas === 1 ? '' : 's'} · nota mínima {prova.notaMinima}% · {MAX_TENTATIVAS} chances por ciclo.
              Se não atingir a nota nas {MAX_TENTATIVAS}, você volta ao manual "{manualRetorno}".
            </p>
            {!proprio ? (
              <p className="mt-3 text-sm text-ink/55">Pré-visualização: a prova é feita pelas unidades.</p>
            ) : estado?.tipo === 'aprovado' ? (
              <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-lime-dark"><Award className="h-4 w-4" aria-hidden="true" /> Aprovado.</p>
            ) : estado?.tipo === 'corrigindo' ? (
              erroCorrecao ? <Aviso tom="erro"><p role="alert">{erroCorrecao}</p><Button type="button" variant="secondary" className="mt-2" onClick={() => setTiqueCorrecao((t) => t + 1)}>Tentar novamente</Button></Aviso> : <p role="status" className="mt-3 text-sm text-ink/60">Sua última tentativa está sendo corrigida…</p>
            ) : estado?.tipo === 'reestudo' ? (
              <div className="mt-3 space-y-2">
                <Aviso>Você usou as {MAX_TENTATIVAS} chances deste ciclo. Conclua o reestudo do manual para liberar novas tentativas.</Aviso>
                <Link to={`/universidade/curso/${curso.id}/reestudo`} className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark">
                  <RotateCcw className="h-4 w-4" aria-hidden="true" /> {estado.reestudo ? 'Continuar o reestudo' : 'Voltar ao manual'}
                </Link>
              </div>
            ) : estado?.tipo === 'disponivel' ? (
              <div className="mt-3 space-y-2">
                <p className="text-sm">
                  {estado.restantes === 1 ? 'Resta 1 chance' : `Restam ${estado.restantes} chances`} neste ciclo{estado.ciclo > 1 ? ` (ciclo ${estado.ciclo})` : ''}.
                </p>
                {aulasCompletas ? (
                  <Link to={`/universidade/curso/${curso.id}/prova`} className="inline-flex items-center gap-2 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark">
                    <BookOpen className="h-4 w-4" aria-hidden="true" /> Fazer a prova
                  </Link>
                ) : (
                  <p className="text-sm text-ink/60">Conclua as {curso.aulas.length} aulas para liberar a prova ({aulasFeitas} de {curso.aulas.length}).</p>
                )}
              </div>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
}
