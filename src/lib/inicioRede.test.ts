import { describe, expect, it } from 'vitest'
import { motivoSaude, resumirUnidade, sinaisSaude } from './acompanhamento'
import type { DadosAcompanhamento } from './acompanhamentoApi'
import { linhasRede, pendenciaPrincipal } from './inicioRede'

const agora = new Date(2026, 10, 19, 12).getTime()
const prazoMs = agora - 86_400_000
const unidade = { id: 'u', nome: 'Uberaba', ativo: true, modulosLiberados: [] }
const dados: DadosAcompanhamento = {
  registros: [], passos: [],
  fontes: {
    modelosChecklist: [], execucoes: [], auditorias: [], chamados: [],
    tentativas: [], cursosPublicados: 0, progresso: [], trilhaManuais: 0, pedidos: [],
    registros: [], passos: [],
    acoes: [
      { id: 'ação 1', auditoriaId: 'auditoria', unidadeId: 'u', descricao: 'Revisar acesso', responsavel: 'Ana', prazoMs, status: 'aberta' },
      { id: '2', unidadeId: 'u', prazoMs: prazoMs + 1, status: 'aberta' },
    ],
  },
}

describe('Alertas no início da franqueadora', () => {
  it('usa a classificação e os motivos da Visão da rede para uma unidade atrasada', () => {
    const [linha] = linhasRede([unidade, { ...unidade, id: 'inativa', ativo: false }], dados, agora)
    expect(linhasRede([{ ...unidade, ativo: false }], dados, agora)).toEqual([])
    expect(linha.saude).toBe('vermelho')
    expect(linha.motivo).toEqual(motivoSaude(sinaisSaude(resumirUnidade(unidade, dados.fontes, agora), agora)))
    expect(linha.destino).toBe('/acompanhamento/unidade/u')
  })

  it('identifica a fonte que falhou', () => {
    const [linha] = linhasRede([unidade], { ...dados, fontes: { ...dados.fontes, acoes: null, auditorias: [{
      id: 'a', unidadeId: 'u', dataVisitaMs: agora, score: 100, resultado: 'aprovada', status: 'concluida', modeloTitulo: 'Abertura',
    }] } }, agora)
    expect(linha.saude).toBe('insuficiente')
    expect(linha.motivo.sinaisIndisponiveis).toContain('Ações de auditoria atrasadas')
  })

  it('identifica a ação atrasada com responsável, prazo e link direto', () => {
    const [linha] = linhasRede([unidade], dados, agora)
    expect(pendenciaPrincipal(linha, dados, agora)).toMatchObject({
      titulo: 'Revisar acesso', responsavel: 'Ana', prazoMs, destino: '/auditorias/auditoria?acao=a%C3%A7%C3%A3o%201',
    })
  })

  it('usa o prazo do SLA e endereça o chamado correto', () => {
    const chamados = [{
      id: 'ch/1', unidadeId: 'u', titulo: 'Acesso ao portão', status: 'aberto',
      criadoEmMs: prazoMs - 3_600_000, slaHoras: 1, responsavelNome: 'Bia',
    }]
    const carga = { ...dados, fontes: { ...dados.fontes, acoes: [], chamados } }
    const [linha] = linhasRede([unidade], carga, agora)
    expect(pendenciaPrincipal(linha, carga, agora)).toMatchObject({
      titulo: 'Acesso ao portão', responsavel: 'Bia', prazoMs, destino: '/chamados?id=ch%2F1',
    })
  })

  it('endereça o passo compartilhado em atraso e ignora os já validados', () => {
    const passo = {
      id: 'p 1', registroId: 'r', unidadeId: 'u', descricao: 'Revisar vistoria', responsavel: 'Bia', prazoMs,
      status: 'aberto' as const, compartilhado: true, comentarioUnidade: '', comentarioFranqueadora: '',
      criadoEmMs: 0, atualizadoPorNome: '', atualizadoEmMs: 0,
    }
    const passos = [passo, { ...passo, id: 'p2', prazoMs: prazoMs - 1, status: 'validado' as const }]
    const carga = { ...dados, passos, fontes: { ...dados.fontes, acoes: [], passos } }
    const [linha] = linhasRede([unidade], carga, agora)
    expect(pendenciaPrincipal(linha, carga, agora)).toMatchObject({
      titulo: 'Revisar vistoria', responsavel: 'Bia', prazoMs, destino: '/acompanhamento/unidade/u?passo=p%201',
    })
  })
})
