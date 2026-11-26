import { useCallback, useEffect, useRef, useState } from 'react'
import type { Usuario } from '../../types'
import { horaRascunho, mesclarRespostasRascunho, respostasIniciais, type ChaveRascunho, type ModeloChecklist, type Resposta } from '../../lib/checklist'
import { lerRascunho, rascunhoIndisponivel, RASCUNHO_NO_APARELHO, removerRascunho, salvarRascunho } from '../../lib/checklistApi'

interface RespostasFormulario {
  respostas: Resposta[]
  obsGeral: string
}

const INDISPONIVEL = 'Salvamento automático indisponível'
const ATRASO_MS = 1200
const TENTAR_DE_NOVO_MS = 4000

export function useRascunhoChecklist(autor: Usuario, modelo: ModeloChecklist, periodo: string) {
  const [chave] = useState<ChaveRascunho>(() => ({ modeloId: modelo.id, versao: modelo.versao, periodo }))
  const [formulario, setFormulario] = useState<RespostasFormulario>(() => ({ respostas: respostasIniciais(modelo), obsGeral: '' }))
  const [carregando, setCarregando] = useState(true)
  const [retomado, setRetomado] = useState(0)
  const [status, setStatus] = useState('')
  const fila = useRef({
    pendente: null as RespostasFormulario | null,
    gravando: null as Promise<void> | null,
    timer: undefined as number | undefined,
    pausada: false,
    indisponivel: false,
    proteger: false,
    montado: false,
  })
  const atual = useRef(formulario)
  const { uid, unidadeId } = autor

  const gravar = useCallback(function gravar() {
    const f = fila.current
    if (f.pausada || f.indisponivel || f.proteger || f.gravando || !f.pendente) return
    window.clearTimeout(f.timer)
    f.timer = undefined
    const dados = f.pendente
    f.pendente = null
    if (f.montado) setStatus('Salvando…')
    let atraso = ATRASO_MS
    f.gravando = salvarRascunho({ uid, unidadeId }, { ...chave, ...dados })
      .then((ms) => {
        const local = RASCUNHO_NO_APARELHO ? ' neste aparelho' : ''
        if (f.montado) setStatus(f.pendente ? 'Salvando…' : `Salvo${local} às ${horaRascunho(ms)}`)
      })
      .catch((erro) => {
        f.indisponivel = rascunhoIndisponivel(erro)
        if (!f.indisponivel) f.pendente ??= dados
        atraso = TENTAR_DE_NOVO_MS
        if (f.montado) setStatus(f.indisponivel ? INDISPONIVEL : 'Não foi possível salvar. Tentando de novo…')
      })
      .finally(() => {
        f.gravando = null
        if (f.montado && f.pendente && !f.pausada && !f.indisponivel && f.timer === undefined) {
          f.timer = window.setTimeout(() => {
            f.timer = undefined
            gravar()
          }, atraso)
        }
      })
  }, [chave, uid, unidadeId])

  useEffect(() => {
    const f = fila.current
    let ativo = true
    f.montado = true
    lerRascunho({ uid, unidadeId }, chave)
      .then((r) => {
        if (!ativo || !r) return
        const dados = { respostas: mesclarRespostasRascunho(modelo, r.respostas), obsGeral: r.obsGeral }
        atual.current = dados
        setFormulario(dados)
        setRetomado(r.atualizadoEmMs)
        if (r.atualizadoEmMs) {
          const local = RASCUNHO_NO_APARELHO ? ' neste aparelho' : ''
          setStatus(`Salvo${local} às ${horaRascunho(r.atualizadoEmMs)}`)
        }
      })
      .catch((erro) => {
        if (!ativo) return
        f.indisponivel = rascunhoIndisponivel(erro)
        // Sem a leitura, um salvamento gravaria o formulário vazio por cima do rascunho.
        f.proteger = !f.indisponivel
        setStatus(f.indisponivel ? INDISPONIVEL : 'Não foi possível recuperar as respostas salvas.')
      })
      .finally(() => ativo && setCarregando(false))
    const gravarPendentes = () => {
      if (!f.pendente || f.pausada || f.indisponivel || f.proteger) return
      window.clearTimeout(f.timer)
      f.timer = undefined
      if (f.gravando) void f.gravando.then(gravar)
      else gravar()
    }
    const aoOcultar = () => {
      if (document.visibilityState === 'hidden') gravarPendentes()
    }
    document.addEventListener('visibilitychange', aoOcultar)
    window.addEventListener('beforeunload', gravarPendentes)
    return () => {
      ativo = false
      f.montado = false
      window.clearTimeout(f.timer)
      f.timer = undefined
      gravarPendentes()
      document.removeEventListener('visibilitychange', aoOcultar)
      window.removeEventListener('beforeunload', gravarPendentes)
    }
  }, [chave, gravar, modelo, uid, unidadeId])

  function atualizar(alterar: (dados: RespostasFormulario) => RespostasFormulario) {
    const f = fila.current
    if (f.pausada) return
    const dados = alterar(atual.current)
    atual.current = dados
    setFormulario(dados)
    if (f.indisponivel || f.proteger) return
    f.pendente = dados
    setStatus('Salvando…')
    window.clearTimeout(f.timer)
    f.timer = window.setTimeout(() => {
      f.timer = undefined
      gravar()
    }, ATRASO_MS)
  }

  async function pausar() {
    const f = fila.current
    f.pausada = true
    window.clearTimeout(f.timer)
    f.timer = undefined
    await f.gravando
  }

  function continuar() {
    fila.current.pausada = false
    gravar()
  }

  async function remover() {
    await removerRascunho({ uid, unidadeId }, chave)
    fila.current.pendente = null
  }

  async function recomecar() {
    await pausar()
    try {
      await remover()
      const dados = { respostas: respostasIniciais(modelo), obsGeral: '' }
      atual.current = dados
      setFormulario(dados)
      setRetomado(0)
      setStatus('')
    } finally {
      continuar()
    }
  }

  return { ...formulario, carregando, retomado, status, atualizar, pausar, continuar, remover, recomecar }
}
