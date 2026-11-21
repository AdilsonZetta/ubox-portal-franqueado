import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, Clock, RotateCcw } from 'lucide-react'
import { Anexos, DocumentoView } from '../../components/DocumentoView'
import { Aviso, Button, Carregando, Selo } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { formatarDuracao, saiuDaTela, segundosRestantes } from '../../lib/manuaisTrilha'
import { usePortal } from '../../lib/portal'
import type { Reestudo } from '../../lib/universidade'
import { concluirReestudo, iniciarOuReiniciarReestudo } from '../../lib/universidadeApi'
import { useVisao } from '../../lib/visao'
import { seloDoCurso } from './Universidade'
import { useUniversidade } from './useUniversidade'

function focoEmIframeDaPagina(): boolean {
  const ativo = document.activeElement
  return Boolean(ativo && ativo.tagName === 'IFRAME' && document.body.contains(ativo))
}

/**
 * Reestudo depois de 3 reprovações: o mesmo cronômetro do módulo 4 (sair da tela recomeça),
 * gravado em reestudos/{uid}_{curso}_{ciclo}. Concluir libera um ciclo novo de 3 chances.
 */
export function ReestudoPage() {
  const { cursoId = '' } = useParams()
  const { user } = useAuth()
  const { comoFranqueado } = useVisao()
  const portal = usePortal()
  const dados = useUniversidade()
  const curso = dados.cursos.find((c) => c.id === cursoId)
  const prova = dados.provas.get(cursoId)
  const estado = curso ? seloDoCurso(curso, dados).estado : null
  const ciclo = estado?.tipo === 'reestudo' ? estado.ciclo : 0
  const documento = prova ? portal.documentos.find((d) => d.id === prova.manualRetornoId) : undefined
  const [reestudo, setReestudo] = useState<Reestudo | null>(null)
  const [inicioLocal, setInicioLocal] = useState<number | null>(null)
  const [agora, setAgora] = useState(() => Date.now())
  const [aviso, setAviso] = useState('')
  const [erro, setErro] = useState('')
  const [concluindo, setConcluindo] = useState(false)
  const [concluido, setConcluido] = useState(false)
  const reiniciando = useRef(false)
  const fora = useRef(false)
  const participa = dados.participa && !comoFranqueado
  const tempo = prova?.tempoReestudoSeg ?? 0
  const restante = inicioLocal !== null ? segundosRestantes(inicioLocal, agora, tempo) : tempo
  const monitorar = Boolean(participa && prova && ciclo && reestudo && reestudo.status !== 'concluido' && !concluido)

  const comecar = useCallback(async () => {
    if (!user || !prova || !ciclo || reiniciando.current) return
    reiniciando.current = true
    setInicioLocal(null)
    setErro('')
    try {
      const atual = await iniciarOuReiniciarReestudo(user, prova, ciclo)
      setReestudo(atual)
      if (atual && atual.status !== 'concluido' && !fora.current) {
        setInicioLocal(Date.now())
        setAgora(Date.now())
      }
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      reiniciando.current = false
    }
  }, [user, prova, ciclo])

  useEffect(() => {
    if (!participa || !ciclo || !prova) return
    void comecar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participa, ciclo, prova?.cursoId])

  useEffect(() => {
    if (!monitorar) return
    const naTela = () => document.visibilityState === 'visible' && (document.hasFocus() || focoEmIframeDaPagina())
    const saiu = () => {
      if (fora.current) return
      fora.current = true
      setInicioLocal(null)
      setAviso('Você saiu da tela, o tempo recomeçou. Ele volta a contar do zero quando você estiver aqui.')
    }
    const voltou = () => {
      if (!fora.current || !naTela()) return
      fora.current = false
      void comecar()
    }
    const aoVisibilidade = () => {
      if (saiuDaTela({ tipo: 'visibilidade', oculto: document.visibilityState === 'hidden' })) saiu()
      else voltou()
    }
    const aoBlur = () => {
      window.setTimeout(() => {
        if (saiuDaTela({ tipo: 'blur', focoEmIframeDaPagina: focoEmIframeDaPagina() })) saiu()
      }, 0)
    }
    const relogio = window.setInterval(() => {
      setAgora(Date.now())
      if (!naTela()) saiu()
      else voltou()
    }, 1000)
    document.addEventListener('visibilitychange', aoVisibilidade)
    window.addEventListener('blur', aoBlur)
    window.addEventListener('focus', voltou)
    return () => {
      window.clearInterval(relogio)
      document.removeEventListener('visibilitychange', aoVisibilidade)
      window.removeEventListener('blur', aoBlur)
      window.removeEventListener('focus', voltou)
    }
  }, [monitorar, comecar])

  async function concluir() {
    if (!user || !ciclo || restante > 0) return
    setConcluindo(true)
    setErro('')
    try {
      await concluirReestudo(user, cursoId, ciclo)
      setConcluido(true)
      setAviso('')
    } catch (falha) {
      const texto = mensagemErro(falha)
      setErro(/permiss/i.test(texto) ? 'O servidor ainda não registrou o tempo mínimo desde a última vez que o cronômetro recomeçou. Aguarde alguns segundos e tente de novo.' : texto)
    } finally {
      setConcluindo(false)
    }
  }

  if (!user) return null
  if (dados.carregando && !concluido) return <Carregando texto="Abrindo o reestudo…" />
  const voltar = (
    <Link to={`/universidade/curso/${cursoId}`} className="text-sm font-semibold text-brand-dark">
      Voltar para o curso
    </Link>
  )
  if (concluido) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Aviso tom="ok">Reestudo concluído. Você ganhou mais 3 chances na prova.</Aviso>
        <Link to={`/universidade/curso/${cursoId}/prova`} className="inline-flex rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark">
          Ir para a prova
        </Link>
      </div>
    )
  }
  if (dados.erro) return <Aviso tom="erro"><p role="alert">{dados.erro}</p><Button type="button" variant="secondary" className="mt-2" onClick={dados.recarregar}>Tentar novamente</Button></Aviso>
  if (!curso || !prova) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Aviso tom="erro">Curso indisponível.</Aviso>
        {voltar}
      </div>
    )
  }
  if (!participa || !ciclo) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Aviso>{!participa ? 'Pré-visualização: o reestudo é feito pelas unidades.' : 'Não há reestudo pendente neste curso.'}</Aviso>
        {voltar}
      </div>
    )
  }
  if (!documento) return <Aviso tom="erro">O manual de retorno não está disponível para o seu usuário.</Aviso>
  const percentual = tempo ? Math.round(((tempo - restante) / tempo) * 100) : 100

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <p className="text-sm text-ink/45">
        <Link to="/universidade">Universidade UBOX</Link> / <Link to={`/universidade/curso/${curso.id}`}>{curso.titulo}</Link> / Reestudo
      </p>
      <div className="sticky top-0 z-20 -mx-1 rounded-2xl border border-line bg-white/95 p-4 shadow-sm backdrop-blur" aria-live="polite">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand-dark" aria-hidden="true">
            {reestudo?.status === 'concluido' ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-black text-ink">
              <RotateCcw className="mr-1 inline h-4 w-4" aria-hidden="true" /> Reestudo: {documento.titulo}
            </h1>
            <p className="text-xs text-ink/60">
              {inicioLocal === null ? (
                erro ? 'O cronômetro não iniciou. Tente novamente.' : 'Cronômetro parado. Volte para esta tela para ele contar do zero.'
              ) : restante > 0 ? (
                <>
                  Faltam <strong className="text-ink">{formatarDuracao(restante)}</strong> de {formatarDuracao(tempo)}. Fique nesta tela: se sair, o tempo recomeça.
                </>
              ) : (
                'Tempo mínimo cumprido. Já pode concluir o reestudo.'
              )}
            </p>
          </div>
          {reestudo && reestudo.reinicios > 0 ? <Selo tom="alerta">{reestudo.reinicios} reinício{reestudo.reinicios === 1 ? '' : 's'}</Selo> : null}
          <Button type="button" onClick={() => void concluir()} disabled={restante > 0 || concluindo || inicioLocal === null}>
            {concluindo ? 'Concluindo…' : 'Concluir reestudo'}
          </Button>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuenow={percentual} aria-valuemin={0} aria-valuemax={100} aria-label="Tempo mínimo cumprido">
          <div className="h-full rounded-full bg-brand transition-[width] duration-700 motion-reduce:transition-none" style={{ width: `${percentual}%` }} />
        </div>
      </div>
      {aviso ? <Aviso>{aviso}</Aviso> : null}
      {erro ? <Aviso tom="erro"><p role="alert">{erro}</p>{inicioLocal === null ? <Button type="button" variant="secondary" className="mt-2" onClick={() => void comecar()}>Tentar iniciar o cronômetro novamente</Button> : null}</Aviso> : null}
      <article className="rounded-3xl border border-line bg-white p-5 shadow-sm md:p-8">
        <DocumentoView documento={documento} />
        <Anexos anexos={documento.anexos} />
      </article>
    </div>
  )
}
