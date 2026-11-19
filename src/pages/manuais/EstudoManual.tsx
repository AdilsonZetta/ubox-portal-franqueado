import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, Clock, Eye } from 'lucide-react'
import { Anexos, DocumentoView } from '../../components/DocumentoView'
import { Aviso, Button, Carregando, Selo } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { formatarData } from '../../lib/format'
import { concluirManual, iniciarOuReiniciar, listarMeuProgresso, listarTrilhaManuais } from '../../lib/manuaisApi'
import {
  estadoDoManual,
  fazTrilha,
  formatarDuracao,
  ordenarTrilha,
  saiuDaTela,
  segundosRestantes,
  type ItemTrilhaManual,
  type ProgressoManual,
} from '../../lib/manuaisTrilha'
import { usePortal } from '../../lib/portal'
import { useVisao } from '../../lib/visao'

function focoEmIframeDaPagina(): boolean {
  const ativo = document.activeElement
  return Boolean(ativo && ativo.tagName === 'IFRAME' && document.body.contains(ativo))
}

export function EstudoManualPage() {
  const { documentoId = '' } = useParams()
  const { user } = useAuth()
  const { comoFranqueado } = useVisao()
  const portal = usePortal()
  const documento = portal.documentos.find((item) => item.id === documentoId)
  const [itens, setItens] = useState<ItemTrilhaManual[]>([])
  const [progressos, setProgressos] = useState<ProgressoManual[]>([])
  const [progresso, setProgresso] = useState<ProgressoManual | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [inicioLocal, setInicioLocal] = useState<number | null>(null)
  const [agora, setAgora] = useState(() => Date.now())
  const [concluindo, setConcluindo] = useState(false)
  const reiniciando = useRef(false)
  const fora = useRef(false)

  const item = itens.find((i) => i.documentoId === documentoId) ?? null
  const estado = useMemo(() => {
    if (!item) return null
    return estadoDoManual(item, new Map(progressos.map((p) => [p.documentoId, p])))
  }, [item, progressos])
  const participa = fazTrilha(user) && !comoFranqueado
  const concluido = progresso?.status === 'concluido'
  const monitorar = Boolean(participa && item && progresso && !concluido)
  const restante = item && inicioLocal !== null ? segundosRestantes(inicioLocal, agora, item.tempoMinimoSeg) : item?.tempoMinimoSeg ?? 0

  // Ao trocar de manual, nada do anterior fica na tela.
  useEffect(() => {
    setProgresso(null)
    setInicioLocal(null)
    setAviso('')
    setErro('')
    fora.current = false
  }, [documentoId])

  // Carrega a trilha e o progresso da pessoa.
  useEffect(() => {
    if (!user) return
    let ativo = true
    setCarregando(true)
    void Promise.all([listarTrilhaManuais(), participa ? listarMeuProgresso(user.uid) : Promise.resolve([])])
      .then(([trilha, meus]) => {
        if (!ativo) return
        setItens(ordenarTrilha(trilha))
        setProgressos(meus)
      })
      .catch((falha) => ativo && setErro(mensagemErro(falha)))
      .finally(() => ativo && setCarregando(false))
    return () => {
      ativo = false
    }
  }, [user, participa, documentoId])

  // Começa (ou recomeça) o cronômetro no servidor e no cliente.
  const comecar = useCallback(async () => {
    if (!user || !item || reiniciando.current) return
    reiniciando.current = true
    setInicioLocal(null)
    try {
      const atual = await iniciarOuReiniciar(user, item)
      setProgresso(atual)
      if (atual && atual.status !== 'concluido' && !fora.current) {
        // O início local é marcado depois da gravação: o servidor sempre conta pelo menos o mesmo tempo.
        setInicioLocal(Date.now())
        setAgora(Date.now())
      }
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      reiniciando.current = false
    }
  }, [user, item])

  useEffect(() => {
    if (!participa || !item || !estado || estado === 'bloqueado') return
    void comecar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [participa, item?.documentoId, estado === 'bloqueado'])

  // Sair da tela zera: aba oculta ou janela sem foco (exceto foco num vídeo ou manual interativo da própria página).
  // O cronômetro fica parado enquanto a pessoa está fora e recomeça do zero quando ela volta.
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
      // Garantia extra para quando o navegador não dispara o evento.
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
    if (!user || !item || restante > 0) return
    setConcluindo(true)
    setErro('')
    try {
      await concluirManual(user, item.documentoId)
      const meus = await listarMeuProgresso(user.uid)
      setProgressos(meus)
      setProgresso(meus.find((p) => p.documentoId === item.documentoId) ?? null)
      setAviso('')
    } catch (falha) {
      const texto = mensagemErro(falha)
      setErro(
        /permiss/i.test(texto)
          ? 'O servidor ainda não registrou o tempo mínimo desde a última vez que o cronômetro recomeçou. Aguarde alguns segundos e tente de novo.'
          : texto,
      )
    } finally {
      setConcluindo(false)
    }
  }

  const ordem = itens.filter((i) => i.ativo)
  const posicao = item ? ordem.findIndex((i) => i.documentoId === item.documentoId) : -1
  const seguinte = posicao >= 0 ? ordem[posicao + 1] : undefined

  if (!user) return null
  if (carregando || (portal.carregando && !documento)) return <Carregando texto="Abrindo o manual…" />
  if (!item || !item.ativo) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Aviso tom="erro">Este manual não está na trilha.</Aviso>
        <Link to="/manuais/trilha" className="text-sm font-semibold text-brand-dark">Voltar para a trilha</Link>
      </div>
    )
  }
  if (participa && estado === 'bloqueado') {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Aviso>Este manual abre quando você concluir o anterior da trilha.</Aviso>
        <Link to="/manuais/trilha" className="text-sm font-semibold text-brand-dark">Voltar para a trilha</Link>
      </div>
    )
  }
  if (!documento) return <Aviso tom="erro">O documento deste manual não está disponível para o seu usuário.</Aviso>

  const percentual = item.tempoMinimoSeg ? Math.round(((item.tempoMinimoSeg - restante) / item.tempoMinimoSeg) * 100) : 100

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <p className="text-sm text-ink/45">
        <Link to="/manuais/trilha">Trilha de manuais</Link>
        {item.etapa ? `  /  ${item.etapa}` : ''}
      </p>

      <div className="sticky top-0 z-20 -mx-1 rounded-2xl border border-line bg-white/95 p-4 shadow-sm backdrop-blur" aria-live="polite">
        <div className="flex flex-wrap items-center gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand-dark" aria-hidden="true">
            {concluido ? <CheckCircle2 className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-black text-ink">{item.titulo}</h1>
            {concluido ? (
              <p className="text-xs text-ink/60">Concluído em {formatarData(progresso?.concluidoEm)}. Você pode rever quando quiser.</p>
            ) : participa ? (
              <p className="text-xs text-ink/60">
                {inicioLocal === null ? (
                  'Cronômetro parado. Volte para esta tela para ele contar do zero.'
                ) : restante > 0 ? (
                  <>
                    Faltam <strong className="text-ink">{formatarDuracao(restante)}</strong> de {formatarDuracao(item.tempoMinimoSeg)}. Fique nesta tela: se sair, o tempo recomeça.
                  </>
                ) : (
                  'Tempo mínimo cumprido. Já pode concluir.'
                )}
              </p>
            ) : (
              <p className="text-xs text-ink/60">
                <Eye className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" />
                Pré-visualização. Tempo mínimo: {formatarDuracao(item.tempoMinimoSeg)}. O cronômetro só corre para as unidades.
              </p>
            )}
          </div>
          {progresso && progresso.reinicios > 0 && !concluido ? <Selo tom="alerta">{progresso.reinicios} reinício{progresso.reinicios === 1 ? '' : 's'}</Selo> : null}
          {participa && !concluido ? (
            <Button type="button" onClick={() => void concluir()} disabled={restante > 0 || concluindo || inicioLocal === null}>
              {concluindo ? 'Concluindo…' : 'Concluir manual'}
            </Button>
          ) : null}
          {concluido && seguinte ? (
            <Link to={`/manuais/estudo/${seguinte.documentoId}`} className="rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-dark">
              Próximo manual
            </Link>
          ) : null}
        </div>
        {participa && !concluido ? (
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuenow={percentual} aria-valuemin={0} aria-valuemax={100} aria-label="Tempo mínimo cumprido">
            <div className="h-full rounded-full bg-brand transition-[width] duration-700 motion-reduce:transition-none" style={{ width: `${percentual}%` }} />
          </div>
        ) : null}
      </div>

      {aviso ? <Aviso>{aviso}</Aviso> : null}
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}

      <article className="rounded-3xl border border-line bg-white p-5 shadow-sm md:p-8">
        <DocumentoView documento={documento} />
        <Anexos anexos={documento.anexos} />
      </article>
    </div>
  )
}
