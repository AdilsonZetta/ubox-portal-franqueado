import { useEffect, useState } from 'react'
import type { Usuario } from '../types'
import { listarCompartilhados } from './acompanhamentoApi'
import { passoAtrasado } from './acompanhamento'
import { acaoAtrasada, daUnidade, podeGerirAuditoria } from './auditoria'
import { listarAcoes } from './auditoriaApi'
import { useAuth } from './auth'
import { observarChamados, prazoDoChamado } from './chamados'
import { fazChecklist, inicioPeriodo, situacaoModelo } from './checklist'
import { listarExecucoes, listarModelos } from './checklistApi'
import { fazCliente, hojeISO, situacao } from './cliente'
import { carregarClientes, carregarCobrancasDaUnidade } from './clienteApi'
import { fazCrm, followUps } from './crm'
import { carregarUnidade } from './crmApi'
import { podeModulo } from './modulosAcesso'
import { montarPendencias, type FontesPendencias } from './pendencias'
import { usePortal } from './portal'
import { useVisao } from './visao'

export function usePendencias() {
  const { user } = useAuth()
  const { comoFranqueado, ehAdmin } = useVisao()
  const portal = usePortal()
  const pessoa = comoFranqueado ? null : user
  const [tentativa, setTentativa] = useState(0)
  const [carga, setCarga] = useState<{ pessoa: Usuario; tentativa: number; fontes: FontesPendencias; falhou: boolean }>()

  const [portalAntesDaTentativa, setPortalAntesDaTentativa] = useState<{ pessoa: Usuario; dados: typeof portal }>()

  useEffect(() => {
    if (!pessoa) return
    let ativo = true
    const agora = Date.now()
    const unidade = pessoa.unidadeId
    const rede = pessoa.papel === 'admin' || pessoa.papel === 'equipe_franqueadora'
    const permitido = (slug: string) => podeModulo(pessoa, slug, false)
    const tarefas: Promise<void>[] = []
    const fontes: FontesPendencias = {}
    let falhou = false
    const buscar = (fonte: keyof FontesPendencias, carregar: () => Promise<number>) => {
      tarefas.push((async () => {
        try {
          fontes[fonte] = await carregar()
        } catch {
          falhou = true
        }
      })())
    }
    let cancelarChamados: (() => void) | undefined
    let concluirChamados: (() => void) | undefined
    if (permitido('chamados') && (rede || unidade)) {
      buscar('chamados', () => new Promise<number>((resolve, reject) => {
        concluirChamados = () => resolve(0)
        cancelarChamados = observarChamados({ rede, unidadeId: unidade }, (chamados) => {
          resolve(chamados.filter((c) => prazoDoChamado(c, agora).atrasado).length)
        }, reject)
      }).finally(() => cancelarChamados?.()))
    }
    if (unidade && permitido('checklist') && fazChecklist(pessoa)) {
      buscar('checklists', async () => {
        const deMs = inicioPeriodo('diaria', agora) - 62 * 86_400_000
        const [modelos, execucoes] = await Promise.all([
          listarModelos(pessoa, false),
          listarExecucoes(pessoa, false, { deMs }),
        ])
        return modelos.filter((m) => m.ativo && situacaoModelo(m, execucoes, agora).situacao === 'atrasado').length
      })
    }
    if (unidade && permitido('crm') && fazCrm(pessoa)) {
      buscar('crm', async () => followUps((await carregarUnidade(unidade)).leads, agora).atrasados.length)
    }
    if (unidade && permitido('cliente') && fazCliente(pessoa)) {
      buscar('cobrancas', async () => {
        const { clientes, paineis } = await carregarClientes(unidade)
        const idsAtivos = new Set(clientes.filter((c) => c.status === 'ativo').map((c) => c.id))
        const cobrancas = await carregarCobrancasDaUnidade(new Map([...paineis].filter(([id]) => idsAtivos.has(id))))
        const hoje = hojeISO(agora)
        return [...cobrancas.values()].flat().filter((c) => situacao(c, hoje) === 'atrasado').length
      })
    }
    const gestorAuditoria = podeGerirAuditoria(pessoa, ehAdmin)
    if (permitido('auditoria') && (gestorAuditoria || (unidade && daUnidade(pessoa)))) {
      buscar('auditoria', async () => (await listarAcoes(gestorAuditoria, unidade)).filter((a) => acaoAtrasada(a, agora)).length)
    }
    if (unidade && permitido('acompanhamento') && daUnidade(pessoa)) {
      buscar('acompanhamento', async () => (await listarCompartilhados(unidade)).passos.filter((p) => passoAtrasado(p, agora)).length)
    }
    void Promise.all(tarefas).then(() => {
      if (ativo) setCarga({ pessoa, tentativa, fontes, falhou })
    })
    return () => {
      ativo = false
      concluirChamados?.()
    }
  }, [pessoa, tentativa, ehAdmin])

  const atual = carga && carga.pessoa === pessoa ? carga : undefined
  const fontes: FontesPendencias = { ...atual?.fontes }
  const dadosPortal = !pessoa ? undefined : !portal.carregando ? portal
    : portal.erro && portalAntesDaTentativa?.pessoa === pessoa ? portalAntesDaTentativa.dados : undefined
  const dadosLeituras = podeModulo(pessoa, 'manuais', false) ? dadosPortal : undefined
  const avisosLidos = new Set(dadosPortal?.avisosLidos)
  const itens = montarPendencias({
    ...fontes,
    avisos: dadosPortal?.avisos.filter((a) => !avisosLidos.has(a.id)).length,
    documentos: dadosLeituras?.documentos,
    aceites: dadosLeituras?.aceites,
    uid: pessoa?.uid,
  }).map((item) => item.id === 'auditoria' && podeGerirAuditoria(pessoa, ehAdmin)
    ? { ...item, para: '/auditoria?aba=acoes' }
    : item)
  return {
    itens,
    carregando: Boolean(pessoa && (atual?.tentativa !== tentativa || portal.carregando)),
    falhou: Boolean(pessoa && (atual?.falhou || portal.erro)),
    recarregar: () => {
      setTentativa((atual) => atual + 1)
      if (pessoa && portal.erro && !portal.carregando) {
        setPortalAntesDaTentativa({ pessoa, dados: portal })
        void portal.atualizar()
      }
    },
  }
}
