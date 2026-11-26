import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CheckCircle2, Clock, Eye } from 'lucide-react'
import { Anexos, DocumentoView } from '../../components/DocumentoView'
import { Aviso, Button, Carregando, LinkBotao, Selo } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { formatarData } from '../../lib/format'
import { concluirManual, iniciarOuReiniciar, listarMeuProgresso, listarTrilhaManuais, pausarManual, registrarManual, retomarManual, TEMPO_ACUMULADO } from '../../lib/manuaisApi'
import {
  estadoDoManual,
  fazTrilha,
  formatarDuracao,
  ordenarTrilha,
  saiuDaTela,
  proximoPassoDaTrilha,
  restanteAtivo,
  segundosAtivosAgora,
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

function manualNaTela(): boolean {
  return document.visibilityState === 'visible' && (document.hasFocus() || focoEmIframeDaPagina())
}

export function EstudoManualPage() {
  const { documentoId = '' } = useParams()
  const { user } = useAuth()
  const { comoFranqueado } = useVisao()
  if (!user) return null
  return <EstudoPorManual key={JSON.stringify([documentoId, user.uid, comoFranqueado])} documentoId={documentoId} />
}

function EstudoPorManual({ documentoId }: { documentoId: string }) {
  const { user } = useAuth()
  const { comoFranqueado } = useVisao()
  const portal = usePortal()
  const documento = portal.documentos.find((item) => item.id === documentoId)
  const [itens, setItens] = useState<ItemTrilhaManual[]>([])
  const [progressos, setProgressos] = useState<ProgressoManual[]>([])
  const [progresso, setProgresso] = useState<ProgressoManual | null>(null)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [erroCarga, setErroCarga] = useState('')
  const [erroInicio, setErroInicio] = useState('')
  const [tentativa, setTentativa] = useState(0)
  const [iniciando, setIniciando] = useState(false)
  const [aviso, setAviso] = useState('')
  const [inicioLocal, setInicioLocal] = useState<number | null>(null)
  const [acumulado, setAcumulado] = useState(0)
  const [erroCronometro, setErroCronometro] = useState('')
  const montado = useRef(false)
  const inicioRef = useRef<number | null>(null)
  const fila = useRef(Promise.resolve())
  const versaoPresenca = useRef(0)
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
  const tempoMinimo = item?.tempoMinimoSeg ?? 0
  const restante = TEMPO_ACUMULADO
    ? restanteAtivo(tempoMinimo, acumulado, inicioLocal, agora)
    : inicioLocal !== null ? segundosRestantes(inicioLocal, agora, tempoMinimo) : tempoMinimo

  const marcarInicio = useCallback((inicio: number | null) => {
    inicioRef.current = inicio
    setInicioLocal(inicio)
    if (inicio !== null) setAgora(inicio)
  }, [])

  const enfileirar = useCallback((operacao: () => Promise<void>) => {
    const proxima = fila.current.then(operacao)
    fila.current = proxima.catch(() => undefined)
    return proxima
  }, [])

  useEffect(() => {
    montado.current = true
    return () => { montado.current = false }
  }, [])

  // Carrega a trilha e o progresso da pessoa.
  useEffect(() => {
    if (!user) return
    let ativo = true
    setCarregando(true)
    setErroCarga('')
    void Promise.all([listarTrilhaManuais(), participa ? listarMeuProgresso(user.uid) : Promise.resolve([])])
      .then(([trilha, meus]) => {
        if (!ativo) return
        setItens(ordenarTrilha(trilha))
        setProgressos(meus)
      })
      .catch((falha) => ativo && setErroCarga(mensagemErro(falha)))
      .finally(() => ativo && setCarregando(false))
    return () => {
      ativo = false
    }
  }, [user, participa, tentativa])

  // Começa (ou recomeça) o cronômetro no servidor e no cliente.
  const comecar = useCallback(async () => {
    if (!user || !item || reiniciando.current) return
    reiniciando.current = true
    setIniciando(true)
    setErroInicio('')
    marcarInicio(null)
    const iniciar = async () => {
      const atual = await iniciarOuReiniciar(user, item)
      if (!atual) throw new Error('O cronômetro não foi confirmado pelo servidor.')

      let acumuladoServidor = atual.segundosAtivos
      if (TEMPO_ACUMULADO && atual.status !== 'concluido' && (!montado.current || !manualNaTela())) {
        fora.current = true
        try {
          const resposta = await pausarManual(item.documentoId)
          if (resposta) acumuladoServidor = resposta.segundosAtivos
        } catch {
          if (montado.current) setErroCronometro('Não foi possível salvar o tempo de leitura no servidor.')
        }
      } else if (TEMPO_ACUMULADO) {
        setErroCronometro('')
      }
      if (!montado.current) return
      setProgresso(atual)
      if (TEMPO_ACUMULADO) setAcumulado(acumuladoServidor)
      if (atual.status !== 'concluido' && !fora.current) {
        // O servidor começa a contar antes da confirmação chegar ao cliente.
        marcarInicio(Date.now())
      }
    }
    try {
      if (TEMPO_ACUMULADO) await enfileirar(iniciar)
      else await iniciar()
    } catch (falha) {
      setErroInicio(mensagemErro(falha))
    } finally {
      reiniciando.current = false
      setIniciando(false)
    }
  }, [user, item, enfileirar, marcarInicio])

  const podeIniciar = Boolean(participa && documento && item?.ativo && estado && estado !== 'bloqueado' && !carregando && !erroCarga)
  useEffect(() => {
    if (!podeIniciar) return
    void comecar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [podeIniciar])

  useEffect(() => {
    if (!monitorar) return
    let ativo = true
    let checkpointPendente = false
    let ultimoCheckpoint = 0
    let timerBlur: number | undefined

    const sincronizar = (acao: 'pausar' | 'retomar' | 'registrar') => {
      const versao = versaoPresenca.current
      return enfileirar(async () => {
        if (acao !== 'pausar' && (!ativo || versao !== versaoPresenca.current || !manualNaTela())) return
        try {
          const rpc = acao === 'pausar' ? pausarManual : acao === 'retomar' ? retomarManual : registrarManual
          const resposta = await rpc(documentoId)
          if (!ativo || !resposta) return
          setAcumulado(resposta.segundosAtivos)
          setErroCronometro('')
          if (resposta.status === 'concluido') {
            setProgresso(resposta)
            marcarInicio(null)
          } else if (acao !== 'pausar' && versao === versaoPresenca.current && !fora.current && manualNaTela()) {
            marcarInicio(Date.now())
          }
        } catch {
          if (!ativo) return
          if (acao === 'retomar' && versao === versaoPresenca.current) {
            setErroInicio('Não foi possível retomar a leitura.')
          } else if (acao !== 'retomar') {
            setErroCronometro('Não foi possível salvar o tempo de leitura no servidor.')
          }
        }
      })
    }

    const saiu = () => {
      if (fora.current) return
      fora.current = true
      const inicio = inicioRef.current
      marcarInicio(null)
      if (TEMPO_ACUMULADO) {
        versaoPresenca.current += 1
        const momentoDaPausa = Date.now()
        setAcumulado((valor) => segundosAtivosAgora(valor, inicio, momentoDaPausa))
        setAviso('Leitura pausada. Ao voltar, o tempo continua de onde parou.')
        void sincronizar('pausar')
      } else {
        setAviso('Você saiu da tela. Ao voltar, o tempo de leitura começa do zero.')
      }
    }
    const voltou = () => {
      if (!fora.current || !manualNaTela()) return
      fora.current = false
      if (TEMPO_ACUMULADO) {
        versaoPresenca.current += 1
        setAviso('')
        setErroInicio('')
        void sincronizar('retomar')
      } else {
        void comecar()
      }
    }
    const aoVisibilidade = () => {
      if (saiuDaTela({ tipo: 'visibilidade', oculto: document.visibilityState === 'hidden' })) saiu()
      else voltou()
    }
    const aoBlur = () => {
      window.clearTimeout(timerBlur)
      timerBlur = window.setTimeout(() => {
        if (saiuDaTela({ tipo: 'blur', focoEmIframeDaPagina: focoEmIframeDaPagina() })) saiu()
      }, 0)
    }
    const relogio = window.setInterval(() => {
      const momento = Date.now()
      setAgora(momento)
      // Alguns navegadores deixam de disparar os eventos de foco.
      if (!manualNaTela()) saiu()
      else voltou()
      const inicio = inicioRef.current
      if (TEMPO_ACUMULADO && !fora.current && inicio !== null && momento - Math.max(inicio, ultimoCheckpoint) >= 15_000 && !checkpointPendente) {
        checkpointPendente = true
        ultimoCheckpoint = momento
        void sincronizar('registrar').finally(() => { checkpointPendente = false })
      }
    }, 1000)
    document.addEventListener('visibilitychange', aoVisibilidade)
    window.addEventListener('blur', aoBlur)
    window.addEventListener('focus', voltou)
    if (TEMPO_ACUMULADO) {
      if (manualNaTela()) voltou()
      else saiu()
    }
    return () => {
      ativo = false
      window.clearTimeout(timerBlur)
      window.clearInterval(relogio)
      document.removeEventListener('visibilitychange', aoVisibilidade)
      window.removeEventListener('blur', aoBlur)
      window.removeEventListener('focus', voltou)
      if (TEMPO_ACUMULADO && !fora.current) void sincronizar('pausar')
    }
  }, [monitorar, comecar, documentoId, enfileirar, marcarInicio])

  async function concluir() {
    if (!user || !item || restante > 0 || (TEMPO_ACUMULADO && inicioRef.current === null)) return
    setConcluindo(true)
    setErro('')
    try {
      if (TEMPO_ACUMULADO) await enfileirar(() => concluirManual(user, item.documentoId))
      else await concluirManual(user, item.documentoId)
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
  if (erroCarga) return (
    <div className="mx-auto max-w-3xl space-y-3">
      <Aviso tom="erro">{erroCarga}{' '}
        <Button type="button" variant="ghost" onClick={() => setTentativa((valor) => valor + 1)}>Tentar novamente</Button>
      </Aviso>
      <LinkBotao to="/manuais/trilha">Voltar para a trilha</LinkBotao>
    </div>
  )
  if (!item || !item.ativo) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Aviso tom="erro">Este manual não está na trilha.</Aviso>
        <LinkBotao to="/manuais/trilha">Voltar para a trilha</LinkBotao>
      </div>
    )
  }
  if (participa && estado === 'bloqueado') {
    const proximo = proximoPassoDaTrilha(documentoId, itens, progressos)
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Aviso>
          <p>Este manual abre quando você concluir o anterior da trilha.</p>
          {proximo ? <Link to={`/manuais/estudo/${proximo.documentoId}`} className="mt-1 inline-block font-semibold text-brand-dark hover:underline">Próximo passo: concluir “{proximo.titulo}”</Link> : null}
        </Aviso>
        {item.consultaLivre ? (
          <Link to={`/documento/${item.documentoId}?consulta=1`} className="mr-2 inline-flex min-h-11 items-center rounded-xl border border-line bg-surface px-4 text-sm font-semibold hover:border-brand">Consultar procedimento</Link>
        ) : null}
        <LinkBotao to="/manuais/trilha">Voltar para a trilha</LinkBotao>
      </div>
    )
  }
  if (!documento) return (
    <div className="mx-auto max-w-3xl space-y-3">
      <Aviso tom="erro">
        {portal.erro || 'O documento deste manual não está disponível para o seu usuário.'}
        {portal.erro ? <Button type="button" variant="ghost" onClick={() => void portal.atualizar()}>Tentar novamente</Button> : null}
      </Aviso>
      <LinkBotao to="/manuais/trilha">Voltar para a trilha</LinkBotao>
    </div>
  )

  const tempoAtivo = formatarDuracao(segundosAtivosAgora(acumulado, inicioLocal, agora))
  const percentual = item.tempoMinimoSeg ? Math.round(((item.tempoMinimoSeg - restante) / item.tempoMinimoSeg) * 100) : 100

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <p className="text-sm text-ink/45">
        <Link to="/manuais/trilha">Trilha de manuais</Link>
        {item.etapa ? `  /  ${item.etapa}` : ''}
      </p>

      <div className="sticky top-0 z-20 -mx-1 rounded-2xl border border-line bg-white/95 p-4 shadow-sm backdrop-blur" aria-live={TEMPO_ACUMULADO ? undefined : 'polite'}>
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
                  iniciando ? 'Iniciando o cronômetro…' : erroInicio ? 'O cronômetro está parado.' : TEMPO_ACUMULADO
                    ? `Leitura pausada em ${tempoAtivo} de ${formatarDuracao(tempoMinimo)}. Volte para esta tela para continuar.`
                    : 'Ao voltar para esta tela, o cronômetro começa do zero.'
                ) : restante > 0 ? (
                  <>
                    Faltam <strong className="text-ink">{formatarDuracao(restante)}</strong> de {formatarDuracao(item.tempoMinimoSeg)}. {TEMPO_ACUMULADO ? 'Se sair da tela, a contagem pausa e continua quando você voltar.' : 'Fique nesta tela: se sair, o tempo recomeça.'}
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
          {TEMPO_ACUMULADO && participa && !concluido ? <span className="text-xs tabular-nums text-muted">Tempo ativo: {tempoAtivo}</span> : null}
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

      {TEMPO_ACUMULADO ? (
        <div role="status" className="empty:hidden space-y-2">
          {aviso ? <Aviso>{aviso}</Aviso> : null}
          {erroCronometro ? <Aviso>{erroCronometro}</Aviso> : null}
        </div>
      ) : aviso ? <Aviso>{aviso}</Aviso> : null}
      {erroInicio ? (
        <Aviso tom="erro">Falha ao iniciar o cronômetro. {erroInicio}{' '}
          <Button type="button" variant="ghost" onClick={() => void comecar()}>Tentar iniciar novamente</Button>
        </Aviso>
      ) : null}
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}

      <article className="rounded-3xl border border-line bg-white p-5 shadow-sm md:p-8">
        <DocumentoView documento={documento} />
        <Anexos anexos={documento.anexos} />
      </article>
    </div>
  )
}
