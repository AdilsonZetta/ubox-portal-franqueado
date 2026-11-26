import { useState, type FormEvent } from 'react'
import { Aviso, Button, Campo, Carregando, Vazio, inputClass } from '../../components/ui'
import { modeloServeUnidade, primeiroVencimentoPadrao, ROTULO_FREQ, situacaoModelo, validarVigencia } from '../../lib/checklist'
import { removerVigencia, salvarVigencias } from '../../lib/checklistApi'
import { formatarDiaISO, hojeISO } from '../../lib/cliente'
import { mensagemErro } from '../../lib/errors'
import { formatarData } from '../../lib/format'
import { SituacaoSelo } from './partes'
import type { DadosChecklist } from './useChecklist'

interface Props {
  dados: DadosChecklist
  unidades: { lista: { id: string; nome: string; checklist: boolean }[]; carregando: boolean; erro: string; recarregar: () => void }
  agora: number
}

export function VigenciasUnidade({ dados, unidades, agora }: Props) {
  const [unidadeId, setUnidadeId] = useState('')
  const [selecionadas, setSelecionadas] = useState<string[]>([])
  const [inicio, setInicio] = useState(() => hojeISO())
  const [vencimentoEditado, setVencimentoEditado] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const [ok, setOk] = useState('')
  const recorrentes = dados.modelos.filter((m) => m.frequencia !== 'avulsa' && modeloServeUnidade(m, unidadeId))
  const primeira = recorrentes.find((m) => m.id === selecionadas[0])
  const primeiroVencimento = vencimentoEditado ?? (primeira ? primeiroVencimentoPadrao(primeira.frequencia, inicio) : '')
  const vigencias = dados.vigencias.filter((v) => v.unidadeId === unidadeId)
  const execucoes = dados.execucoes.filter((e) => e.unidadeId === unidadeId)
  const opcoes = unidades.lista.filter((u) => u.checklist)

  async function gravar(acao: () => Promise<void>, sucesso: string) {
    setOcupado(true)
    setErro('')
    setOk('')
    try {
      await acao()
      setOk(sucesso)
      dados.recarregar()
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setOcupado(false)
    }
  }

  function habilitar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    const ids = recorrentes.filter((m) => selecionadas.includes(m.id)).map((m) => m.id)
    if (!unidadeId || !ids.length || ocupado) return
    const erros = validarVigencia({ inicio, primeiroVencimento }, hojeISO(agora))
    if (erros.length) {
      setOk('')
      setErro(erros.join(' '))
      return
    }
    void gravar(async () => {
      await salvarVigencias(unidadeId, ids, inicio, primeiroVencimento)
      setSelecionadas([])
      setVencimentoEditado(null)
    }, 'Vigências salvas.')
  }

  if (dados.erro) return null
  const erroCarga = unidades.erro || dados.erroVigencias
  return (
    <section className="space-y-4" aria-label="Vigência por unidade">
      <div aria-live="polite">
        {ok ? <Aviso tom="ok">{ok}</Aviso> : null}
        {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      </div>
      {erroCarga ? (
        <Aviso tom="erro">
          <p role="alert">{unidades.erro || 'Não foi possível carregar as vigências.'}</p>
          <Button type="button" variant="secondary" className="mt-2" onClick={unidades.erro ? unidades.recarregar : dados.recarregar}>Tentar novamente</Button>
        </Aviso>
      ) : null}
      {unidades.carregando ? <Carregando texto="Carregando unidades…" /> : null}
      {!unidades.carregando && !unidades.erro && !opcoes.length ? (
        <Vazio titulo="Nenhuma unidade com Checklist" texto="Libere o módulo Checklist para a unidade e volte aqui." />
      ) : null}
      {opcoes.length ? (
        <form onSubmit={habilitar} className="rounded-2xl border border-line bg-surface p-4 sm:p-6">
          <fieldset className="space-y-4" disabled={ocupado || dados.carregando || unidades.carregando || Boolean(erroCarga)}>
            <Campo label="Unidade">
              <select name="unidade" className={inputClass} value={unidadeId} onChange={(e) => {
                setUnidadeId(e.target.value)
                setSelecionadas([])
                setVencimentoEditado(null)
                setErro('')
                setOk('')
              }}>
                <option value="">Selecione a unidade</option>
                {opcoes.map((u) => <option key={u.id} value={u.id}>{u.nome}</option>)}
              </select>
            </Campo>
            {unidadeId ? (
              <>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-semibold text-ink">Rotinas recorrentes</legend>
                  <p className="text-sm text-muted">Para incluir uma rotina direcionada, adicione a unidade na rotina e volte aqui.</p>
                  {recorrentes.length ? (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {recorrentes.map((m) => (
                        <label key={m.id} className="flex min-h-11 items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm">
                          <input type="checkbox" name="rotinas" value={m.id} className="size-4 shrink-0 accent-brand"
                            checked={selecionadas.includes(m.id)} onChange={(e) => {
                              const marcada = e.target.checked
                              setSelecionadas((ids) => marcada ? [...ids, m.id] : ids.filter((id) => id !== m.id))
                            }} />
                          <span>{m.titulo} <span className="text-muted">· {ROTULO_FREQ[m.frequencia]}</span></span>
                        </label>
                      ))}
                    </div>
                  ) : <Vazio titulo="Nenhuma rotina recorrente disponível" texto="Crie uma rotina ativa para a rede ou direcione uma rotina a esta unidade." />}
                </fieldset>
                {recorrentes.length ? (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Campo label="Início da responsabilidade">
                        <input name="inicio" type="date" className={inputClass} value={inicio} onChange={(e) => setInicio(e.target.value)} required />
                      </Campo>
                      <Campo label="Primeiro vencimento">
                        <input name="primeiroVencimento" type="date" className={inputClass} value={primeiroVencimento}
                          min={inicio || undefined} onChange={(e) => setVencimentoEditado(e.target.value)} required />
                      </Campo>
                    </div>
                    <Button type="submit" disabled={!primeira}>{ocupado ? 'Salvando…' : 'Habilitar rotinas'}</Button>
                  </>
                ) : null}
              </>
            ) : null}
          </fieldset>
        </form>
      ) : null}

      {unidadeId && !dados.carregando && !erroCarga ? (
        <section aria-label="Vigências registradas" className="space-y-2">
          <h2 className="text-lg font-bold">Vigências registradas</h2>
          {vigencias.length ? (
            <div className="overflow-x-auto rounded-2xl border border-line bg-surface" tabIndex={0} role="region" aria-label="Tabela de vigências">
              <table className="w-full text-left text-sm">
                <thead className="bg-paper text-xs uppercase tracking-wide text-muted">
                  <tr>
                    {['Rotina', 'Início', 'Primeiro vencimento', 'Registro', 'Situação', 'Ações'].map((titulo) =>
                      <th key={titulo} scope="col" className="px-4 py-2.5 font-semibold">{titulo}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {vigencias.map((v) => {
                    const modelo = dados.modelos.find((m) => m.id === v.modeloId)
                    const titulo = modelo?.titulo ?? v.modeloId
                    const situacao = modelo && modeloServeUnidade(modelo, unidadeId) ? situacaoModelo(modelo, execucoes, agora, v).situacao : null
                    return (
                      <tr key={v.id}>
                        <th scope="row" className="px-4 py-2.5 font-medium">{titulo}</th>
                        <td className="px-4 py-2.5">{formatarDiaISO(v.inicio)}</td>
                        <td className="px-4 py-2.5">{formatarDiaISO(v.primeiroVencimento)}</td>
                        <td className="px-4 py-2.5">{v.registradoPorNome}<span className="block text-xs text-muted">{formatarData(v.registradoEmMs)}</span></td>
                        <td className="px-4 py-2.5">{situacao ? <SituacaoSelo situacao={situacao} /> : 'Fora de aplicação'}</td>
                        <td className="px-4 py-2.5">
                          <Button type="button" variant="secondary" aria-label={`Remover vigência de ${titulo}`} disabled={ocupado} onClick={() => {
                            if (window.confirm(`Remover a vigência de “${titulo}” para esta unidade? A rotina volta a seguir o calendário regular.`)) {
                              void gravar(() => removerVigencia(v.id), 'Vigência removida.')
                            }
                          }}>Remover</Button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : <Vazio titulo="Nenhuma vigência registrada" texto="Selecione as rotinas e informe as datas para começar." />}
        </section>
      ) : null}
    </section>
  )
}
