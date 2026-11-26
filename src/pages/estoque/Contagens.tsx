import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Aviso, Button, Campo, Selo, Vazio, cx, inputClass } from '../../components/ui'
import { mensagemErro } from '../../lib/errors'
import { formatarData } from '../../lib/format'
import {
  MAX_ITENS_CONTAGEM, camposContagem, criarFilaContagem, divergencias, linhasDigitadas, saldos, validarContagem,
  type LinhaContagem, type RascunhoContagem,
} from '../../lib/estoque'
import { cancelarContagem, confirmarContagem, salvarContagem } from '../../lib/estoqueApi'
import type { UsoEstoque } from './partes'

const DEBOUNCE_MS = 1500
const hora = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' })
type Salvamento = { estado: 'editando' | 'salvando' | 'salvo' } | { estado: 'erro'; mensagem: string }

export function Contagens({ dados, ativa, onFeito }: { dados: UsoEstoque; ativa: boolean; onFeito: (msg: string) => void }) {
  const [aberta] = useState(() => dados.contagens.filter((c) => c.status === 'aberta')
    .sort((a, b) => b.atualizadoEmMs - a.atualizadoEmMs || a.id.localeCompare(b.id))[0])
  const mapa = useMemo(() => saldos(dados.movimentos), [dados.movimentos])
  const contaveis = useMemo(() => {
    const registrados = new Set(aberta?.itens.filter((l) => l.contado !== null).map((l) => l.itemId))
    const ativos = dados.itens.filter((i) => i.ativo || (mapa.get(i.id) ?? 0) !== 0 || registrados.has(i.id))
    if (ativos.length <= MAX_ITENS_CONTAGEM) return ativos
    const preferidos = ativos.filter((i) => registrados.has(i.id))
    return [...preferidos, ...ativos.filter((i) => !registrados.has(i.id))].slice(0, MAX_ITENS_CONTAGEM)
  }, [dados.itens, mapa, aberta])
  const [contados, setContados] = useState(() => camposContagem(aberta?.itens ?? []))
  const [obs, setObs] = useState(aberta?.obs ?? '')
  const [erro, setErro] = useState('')
  const [revisao, setRevisao] = useState<LinhaContagem[] | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [idAberto, setIdAberto] = useState(aberta?.id ?? null)
  const [salvoEm, setSalvoEm] = useState(aberta?.atualizadoEmMs ?? 0)
  const [salvamento, setSalvamento] = useState<Salvamento>({ estado: 'salvo' })
  const [fila] = useState(() => criarFilaContagem(aberta?.id ?? null, (id, rascunho) =>
    salvarContagem(dados.pessoa!, id ? { id } : null, rascunho.itens, rascunho.obs)))
  const pendente = useRef<RascunhoContagem | null>(null)
  const emCurso = useRef<{ rascunho: RascunhoContagem; resultado: Promise<string | null> } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const finalizando = useRef(false)
  const tituloRevisao = useRef<HTMLHeadingElement>(null)
  const linhas = linhasDigitadas(contaveis, mapa, contados)

  const salvarAgora = useCallback((): Promise<string | null> => {
    clearTimeout(timer.current)
    const rascunho = pendente.current
    if (!rascunho || dados.simulando) return Promise.resolve(fila.id)
    if (emCurso.current?.rascunho === rascunho) return emCurso.current.resultado

    const erros = validarContagem(rascunho.itens, true)
    if (erros.length) {
      setSalvamento({ estado: 'erro', mensagem: erros.join(' ') })
      return Promise.resolve(null)
    }

    setSalvamento({ estado: 'salvando' })
    const resultado = fila.salvar(rascunho).then((id) => {
      if (id) {
        setIdAberto(id)
        setSalvoEm(Date.now())
      }
      if (pendente.current === rascunho) {
        pendente.current = null
        setSalvamento({ estado: 'salvo' })
      }
      return id
    }).catch((falha) => {
      if (pendente.current === rascunho) setSalvamento({ estado: 'erro', mensagem: mensagemErro(falha) })
      return null
    }).finally(() => {
      if (emCurso.current?.rascunho === rascunho) emCurso.current = null
    })
    emCurso.current = { rascunho, resultado }
    return resultado
  }, [dados.simulando, fila])

  useEffect(() => {
    const salvarAoSair = () => { if (!finalizando.current) void salvarAgora() }
    const ocultar = () => { if (document.visibilityState === 'hidden') salvarAoSair() }
    document.addEventListener('visibilitychange', ocultar)
    window.addEventListener('pagehide', salvarAoSair)
    return () => {
      document.removeEventListener('visibilitychange', ocultar)
      window.removeEventListener('pagehide', salvarAoSair)
      salvarAoSair()
    }
  }, [salvarAgora])

  useEffect(() => {
    if (!ativa && !finalizando.current) void salvarAgora()
  }, [ativa, salvarAgora])

  useEffect(() => {
    if (revisao && ativa) tituloRevisao.current?.focus()
  }, [revisao, ativa])

  function editar(campos: Record<string, string>, nota: string) {
    setContados(campos)
    setObs(nota)
    setErro('')
    pendente.current = { itens: linhasDigitadas(contaveis, mapa, campos), obs: nota }
    setSalvamento({ estado: 'editando' })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void salvarAgora(), DEBOUNCE_MS)
  }

  function revisar() {
    const erros = validarContagem(linhas.filter((l) => l.contado !== null))
    setErro(dados.ehFranqueado || linhas.some((l) => l.contado !== null) ? erros.join(' ') : '')
    if (!erros.length || (!dados.ehFranqueado && linhas.every((l) => l.contado === null))) {
      setRevisao(linhas)
      void salvarAgora()
    }
  }

  async function finalizar(acao: 'confirmar' | 'cancelar') {
    const pessoa = dados.pessoa
    if (!pessoa || !dados.ehFranqueado || finalizando.current) return
    if (acao === 'confirmar' && !revisao) return
    if (acao === 'cancelar' && !window.confirm('Cancelar esta contagem? Nenhum ajuste será gerado.')) return

    finalizando.current = true
    setOcupado(true)
    setErro('')
    try {
      if (acao === 'cancelar') {
        clearTimeout(timer.current)
        await emCurso.current?.resultado
        if (!fila.id) return
        await cancelarContagem(pessoa, { id: fila.id })
        pendente.current = null
        onFeito('Contagem cancelada. Nenhum ajuste foi gerado.')
      } else if (revisao) {
        const itens = revisao.filter((l) => l.contado !== null)
        const erros = validarContagem(itens)
        if (erros.length) { setErro(erros.join(' ')); return }
        const id = await salvarAgora()
        if (!id) return
        const saldoRevisado = new Map(itens.map((l) => [l.itemId, l.sistema]))
        const n = await confirmarContagem(pessoa, { id, itens, criadoEmMs: aberta?.criadoEmMs ?? Date.now() }, saldoRevisado, obs)
        onFeito(n ? `Contagem confirmada. ${n} ajuste(s) no estoque.` : 'Contagem confirmada. O saldo já estava correto.')
      }
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      finalizando.current = false
      setOcupado(false)
    }
  }

  const anteriores = dados.contagens.filter((c) => c.status !== 'aberta')
  const linhasVisiveis = revisao ?? linhas

  return (
    <section className="space-y-4">
      <div className="space-y-4 rounded-3xl border border-line bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 ref={tituloRevisao} tabIndex={-1} className="text-lg font-bold">{revisao ? 'Revisar diferenças' : idAberto ? 'Contagem em andamento' : 'Nova contagem de inventário'}</h2>
          <p className="text-sm text-muted" role="status">
            {salvamento.estado === 'salvando' ? 'Salvando…' : salvamento.estado === 'editando' ? 'Alterações pendentes' : salvamento.estado === 'salvo' && salvoEm ? `Salvo automaticamente às ${hora.format(salvoEm)}` : ''}
          </p>
        </div>
        <p className="text-sm text-muted">{revisao ? 'Confira as quantidades e os ajustes antes de confirmar.' : 'Informe a quantidade física. Use 0 quando não houver estoque e deixe em branco os itens que ainda não contou.'}</p>
        {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
        {salvamento.estado === 'erro' ? (
          <Aviso tom="erro">
            <p>Não foi possível salvar a contagem. {salvamento.mensagem}</p>
            <Button type="button" variant="secondary" className="mt-2" disabled={ocupado} onClick={() => void salvarAgora()}>Tentar novamente</Button>
          </Aviso>
        ) : null}
        {!linhasVisiveis.length ? <Vazio titulo="Nada para contar" texto="Aguarde o cadastro de itens no catálogo da rede." /> : (
          <div className="overflow-x-auto rounded-2xl border border-line">
            <table className="w-full text-left text-sm">
              <thead className="bg-paper text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">Item</th>
                  <th scope="col" className="px-3 py-2 text-right font-semibold">Saldo no sistema</th>
                  <th scope="col" className="px-3 py-2 font-semibold">Contado</th>
                  {revisao ? <th scope="col" className="px-3 py-2 text-right font-semibold">Diferença</th> : null}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {linhasVisiveis.map((linha) => (
                  <tr key={linha.itemId}>
                    <th scope="row" className="px-3 py-2 font-medium">{linha.itemNome}</th>
                    <td className="px-3 py-2 text-right tabular-nums">{linha.sistema}</td>
                    {revisao ? (
                      linha.contado === null ? (
                        <td className="px-3 py-2 text-muted" colSpan={2}>Não contado – não gera ajuste</td>
                      ) : (
                        <>
                          <td className="px-3 py-2 tabular-nums">{linha.contado}</td>
                          <td className="px-3 py-2 text-right font-bold tabular-nums">{linha.diferenca > 0 ? '+' : ''}{linha.diferenca}</td>
                        </>
                      )
                    ) : (
                      <td className="px-3 py-2">
                        <input aria-label={`Contado de ${linha.itemNome}`} className={cx(inputClass, 'w-28 py-1')} name={`contado-${linha.itemId}`} inputMode="numeric" autoComplete="off"
                          disabled={dados.simulando || ocupado} value={contados[linha.itemId] ?? ''}
                          onBlur={() => void salvarAgora()}
                          onChange={(e) => editar({ ...contados, [linha.itemId]: e.target.value }, obs)} />
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!revisao ? (
          <Campo label="Observação">
            <textarea className={inputClass} rows={2} maxLength={1000} value={obs} disabled={dados.simulando || ocupado}
              onBlur={() => void salvarAgora()} onChange={(e) => editar(contados, e.target.value)} />
          </Campo>
        ) : obs ? <p className="text-sm text-muted">Observação: {obs}</p> : null}
        <p className="text-sm text-muted">{linhasVisiveis.filter((l) => l.contado !== null).length} item(ns) contado(s) · {divergencias(linhasVisiveis.filter((l) => Number.isFinite(l.diferenca)))} divergência(s)</p>
        <div className="flex flex-wrap gap-2">
          {revisao ? (
            <>
              <Button type="button" variant="secondary" disabled={ocupado} onClick={() => { setRevisao(null); setErro('') }}>Voltar à contagem</Button>
              {dados.ehFranqueado ? <Button type="button" disabled={ocupado} onClick={() => void finalizar('confirmar')}>Confirmar e ajustar saldo</Button> : null}
            </>
          ) : (
            <>
              <Button type="button" disabled={ocupado || !linhas.length} onClick={revisar}>Revisar diferenças</Button>
              {dados.ehFranqueado && idAberto ? <Button type="button" variant="ghost" disabled={ocupado} onClick={() => void finalizar('cancelar')}>Cancelar contagem</Button> : null}
            </>
          )}
        </div>
        {!dados.ehFranqueado ? <p className="text-sm text-muted">Só o franqueado confirma e ajusta o saldo</p> : null}
      </div>
      <h3 className="text-sm font-bold uppercase tracking-wide text-ink/50">Contagens anteriores</h3>
      {!anteriores.length ? <Vazio titulo="Nenhuma contagem concluída" texto="As contagens confirmadas ou canceladas ficam aqui." /> : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-white">
          {anteriores.map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
              <span>{formatarData(c.criadoEmMs)} · {c.itens.length} item(ns) · {c.totalDivergencias} divergência(s){c.obs ? ` · ${c.obs}` : ''}</span>
              {c.status === 'confirmada' ? <Selo tom="lima">Confirmada por {c.confirmadoNome}</Selo> : <Selo>Cancelada</Selo>}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
