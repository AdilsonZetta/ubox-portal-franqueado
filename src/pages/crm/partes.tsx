import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { listarEquipeDaUnidade } from '../../lib/gestao'
import { MOTIVOS_PERDA_PADRAO, ORIGENS_PADRAO, ROTULO_ETAPA, fazCrm, podeGerirCrm, type ConfigCrm, type Contato, type Etapa, type Lead } from '../../lib/crm'
import { carregarRede, carregarUnidade, lerConfig } from '../../lib/crmApi'
import { useVisao } from '../../lib/visao'
import type { Usuario } from '../../types'

export interface UsoCrm {
  pessoa: Usuario | null
  gestor: boolean
  participa: boolean
  simulando: boolean
  config: ConfigCrm
  leads: Lead[]
  contatos: Map<string, Contato>
  carregando: boolean
  erro: string
  recarregar: () => void
}

const CONFIG_PADRAO: ConfigCrm = { origens: ORIGENS_PADRAO, motivosPerda: MOTIVOS_PERDA_PADRAO, atualizadoPorNome: '', atualizadoEmMs: 0 }

/** Unidade: leads + contatos (PII) da própria unidade. Franqueadora: só os leads (sem PII). Simulação do admin: lê como gestor, sem PII. */
export function useCrm(): UsoCrm {
  const { user } = useAuth()
  const { ehAdmin, comoFranqueado, simulado } = useVisao()
  const pessoa = comoFranqueado ? simulado : user
  const gestor = podeGerirCrm(user, ehAdmin) && !comoFranqueado
  const participa = fazCrm(pessoa)
  const [config, setConfig] = useState<ConfigCrm>(CONFIG_PADRAO)
  const [leads, setLeads] = useState<Lead[]>([])
  const [contatos, setContatos] = useState<Map<string, Contato>>(new Map())
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [tique, setTique] = useState(0)
  const recarregar = useCallback(() => setTique((t) => t + 1), [])

  useEffect(() => {
    if (!user || !pessoa || (!gestor && !participa && !comoFranqueado)) {
      setCarregando(false)
      return
    }
    let ativo = true
    setCarregando(true)
    setErro('')
    const unidade = pessoa.unidadeId ?? ''
    const tarefa = gestor || comoFranqueado
      ? Promise.all([lerConfig(), carregarRede()]).then(([c, l]) => ({ c, l: comoFranqueado ? l.filter((x) => x.unidadeId === unidade) : l, k: new Map<string, Contato>() }))
      : Promise.all([lerConfig(), carregarUnidade(unidade)]).then(([c, u]) => ({ c, l: u.leads, k: u.contatos }))
    void tarefa
      .then(({ c, l, k }) => {
        if (!ativo) return
        setConfig(c)
        setLeads(l)
        setContatos(k)
      })
      .catch((falha) => ativo && setErro(mensagemErro(falha)))
      .finally(() => ativo && setCarregando(false))
    return () => {
      ativo = false
    }
  }, [user, pessoa, gestor, participa, comoFranqueado, tique])

  return { pessoa, gestor, participa, simulando: comoFranqueado, config, leads, contatos, carregando, erro, recarregar }
}

/** Quem pode ser responsável. Franqueado: ele e a equipe com o módulo. Equipe: ela e quem já é responsável por algum lead
 *  (a equipe não lista usuários; não ampliamos essa leitura). */
export function useResponsaveis(pessoa: Usuario | null, leads: Lead[]): { uid: string; nome: string }[] {
  const [equipe, setEquipe] = useState<{ uid: string; nome: string }[]>([])
  useEffect(() => {
    if (!pessoa || pessoa.papel !== 'franqueado' || !pessoa.unidadeId) return
    void listarEquipeDaUnidade(pessoa.unidadeId)
      .then((lista) => setEquipe(lista.filter((u) => u.ativo && (u.modulosLiberados ?? []).includes('crm')).map((u) => ({ uid: u.uid, nome: u.nome }))))
      .catch(() => undefined)
  }, [pessoa])
  return useMemo(() => {
    const mapa = new Map<string, string>()
    if (pessoa) mapa.set(pessoa.uid, pessoa.nome)
    for (const e of equipe) mapa.set(e.uid, e.nome)
    for (const l of leads) if (l.responsavelUid && !mapa.has(l.responsavelUid)) mapa.set(l.responsavelUid, l.responsavelNome)
    return [...mapa.entries()].map(([uid, nome]) => ({ uid, nome })).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [pessoa, equipe, leads])
}

const COR_ETAPA: Record<Etapa, string> = {
  novo: 'bg-sky-100 text-sky-900',
  contato: 'bg-indigo-100 text-indigo-900',
  visita: 'bg-amber-100 text-amber-900',
  proposta: 'bg-orange-100 text-orange-900',
  ganho: 'bg-lime/25 text-lime-dark',
  perdido: 'bg-red-100 text-red-800',
}

export function EtapaSelo({ etapa }: { etapa: Etapa }) {
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${COR_ETAPA[etapa]}`}>{ROTULO_ETAPA[etapa]}</span>
}

export function Barra({ rotulo, valor, total, extra }: { rotulo: string; valor: number; total: number; extra?: string }) {
  const pct = total ? Math.round((valor * 100) / total) : 0
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-sm"><span>{rotulo}</span><span className="tabular-nums text-ink/60">{valor}{extra ? ` · ${extra}` : ''}</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-paper"><div className="h-full rounded-full bg-brand" style={{ width: `${pct}%` }} /></div>
    </div>
  )
}

export function Numero({ rotulo, valor, dica }: { rotulo: string; valor: string; dica?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase tracking-wide text-ink/45">{rotulo}</p>
      <p className="mt-1 text-2xl font-black tabular-nums">{valor}</p>
      {dica ? <p className="text-xs text-ink/50">{dica}</p> : null}
    </div>
  )
}

export function RodapeModulo11() {
  return <p className="text-center text-[11px] text-ink/35">Módulo 11 construído e revisado pelo Grok Bot no Cursor (o Antigravity estava sem cota nesta rodada).</p>
}
