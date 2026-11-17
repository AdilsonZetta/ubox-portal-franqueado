import { describe, expect, it } from 'vitest'
import {
  DIAS_ROTACAO,
  MS_POR_DIA,
  acessosParaIndicadores,
  contarPessoasComAcesso,
  nomeCategoriaAcesso,
  podeGerenciarAcesso,
  nomeStatusSolicitacao,
  nomeTipoEvento,
  nomeTipoSolicitacao,
  senhaVencida,
  textoEventoAcesso,
  usuarioPodeVerSegredo,
} from './senhas'

describe('Central de Acessos e Senhas — data helpers', () => {
  it('identifica senha vencida pela regra de 90 dias ou pendente de troca', () => {
    const agora = 1_000_000_000_000
    const recente = agora - 10 * MS_POR_DIA
    const limite = agora - DIAS_ROTACAO * MS_POR_DIA
    const vencida = agora - 91 * MS_POR_DIA

    expect(senhaVencida(recente, agora, false)).toBe(false)
    expect(senhaVencida(limite, agora, false)).toBe(false)
    expect(senhaVencida(vencida, agora, false)).toBe(true)

    // Com pendenteTroca = true, sempre considera vencida
    expect(senhaVencida(recente, agora, true)).toBe(true)
    // Sem data de última troca, considera vencida
    expect(senhaVencida(0, agora, false)).toBe(true)
  })

  it('retorna os rótulos corretos para categorias, solicitações e eventos', () => {
    expect(nomeCategoriaAcesso('gestao')).toBe('Gestão')
    expect(nomeCategoriaAcesso('email')).toBe('E-mail corporativo')
    expect(nomeCategoriaAcesso('desconhecida')).toBe('desconhecida')

    expect(nomeTipoSolicitacao('pedir_acesso')).toBe('Pedir acesso')
    expect(nomeTipoSolicitacao('revogar')).toBe('Revogar acesso')

    expect(nomeStatusSolicitacao('aberta')).toBe('Em aberto')
    expect(nomeStatusSolicitacao('concluida')).toBe('Concluída')

    expect(nomeTipoEvento('revelou')).toBe('Revelou senha')
    expect(nomeTipoEvento('troca_senha')).toBe('Senha trocada')
  })

  it('calcula permissão de leitura do segredo conforme papel, unidade e escopo', () => {
    const acessoUnidade = {
      escopo: 'unidade' as const,
      unidadeId: 'un-1',
      visivelPara: ['user-eq-1'],
      visivelParaEquipe: false,
      ultimaTrocaEmMillis: Date.now(),
    }

    const acessoUnidadeEquipe = {
      ...acessoUnidade,
      visivelParaEquipe: true,
    }

    const acessoRede = {
      escopo: 'rede' as const,
      unidadeId: '',
      visivelPara: [],
      visivelParaEquipe: true,
      ultimaTrocaEmMillis: Date.now(),
    }

    // Franqueado da mesma unidade com módulo
    expect(
      usuarioPodeVerSegredo(
        { uid: 'user-fr-1', papel: 'franqueado', unidadeId: 'un-1', modulosLiberados: ['senhas'] },
        acessoUnidade,
      ),
    ).toBe(true)

    // Franqueado de outra unidade
    expect(
      usuarioPodeVerSegredo(
        { uid: 'user-fr-2', papel: 'franqueado', unidadeId: 'un-2', modulosLiberados: ['senhas'] },
        acessoUnidade,
      ),
    ).toBe(false)

    // Equipe da unidade em visivelPara
    expect(
      usuarioPodeVerSegredo(
        { uid: 'user-eq-1', papel: 'equipe_franqueado', unidadeId: 'un-1', modulosLiberados: ['senhas'] },
        acessoUnidade,
      ),
    ).toBe(true)

    // Equipe da unidade fora de visivelPara quando visivelParaEquipe é false
    expect(
      usuarioPodeVerSegredo(
        { uid: 'user-eq-2', papel: 'equipe_franqueado', unidadeId: 'un-1', modulosLiberados: ['senhas'] },
        acessoUnidade,
      ),
    ).toBe(false)

    // Equipe da unidade quando visivelParaEquipe é true
    expect(
      usuarioPodeVerSegredo(
        { uid: 'user-eq-2', papel: 'equipe_franqueado', unidadeId: 'un-1', modulosLiberados: ['senhas'] },
        acessoUnidadeEquipe,
      ),
    ).toBe(true)

    // Admin NÃO pode ver segredo de unidade
    expect(
      usuarioPodeVerSegredo(
        { uid: 'user-admin', papel: 'admin', unidadeId: null, modulosLiberados: ['senhas'] },
        acessoUnidade,
      ),
    ).toBe(false)

    // Equipe da franqueadora NÃO pode ver segredo de unidade
    expect(
      usuarioPodeVerSegredo(
        { uid: 'user-frq', papel: 'equipe_franqueadora', unidadeId: null, modulosLiberados: ['senhas'] },
        acessoUnidade,
      ),
    ).toBe(false)

    // Em modo simulação (comoFranqueado), sempre bloqueia
    expect(
      usuarioPodeVerSegredo(
        { uid: 'user-fr-1', papel: 'franqueado', unidadeId: 'un-1', modulosLiberados: ['senhas'] },
        acessoUnidade,
        true,
      ),
    ).toBe(false)

    // Item de rede: admin pode ver
    expect(
      usuarioPodeVerSegredo(
        { uid: 'user-admin', papel: 'admin', unidadeId: null, modulosLiberados: [] },
        acessoRede,
      ),
    ).toBe(true)

    // Item de rede: equipe da franqueadora com módulo pode ver
    expect(
      usuarioPodeVerSegredo(
        { uid: 'user-frq', papel: 'equipe_franqueadora', unidadeId: null, modulosLiberados: ['senhas'] },
        acessoRede,
      ),
    ).toBe(true)

    // Item de rede: franqueado da unidade com módulo pode ver
    expect(
      usuarioPodeVerSegredo(
        { uid: 'user-fr-1', papel: 'franqueado', unidadeId: 'un-1', modulosLiberados: ['senhas'] },
        acessoRede,
      ),
    ).toBe(true)

    // Item de rede: franqueado sem o módulo senhas não vê
    expect(
      usuarioPodeVerSegredo(
        { uid: 'user-fr-1', papel: 'franqueado', unidadeId: 'un-1', modulosLiberados: ['manuais'] },
        acessoRede,
      ),
    ).toBe(false)
  })

  it('conta pessoas únicas com acesso aos sistemas da unidade', () => {
    const acessos = [
      { visivelPara: ['user-1', 'user-2'], visivelParaEquipe: false },
      { visivelPara: ['user-2', 'user-3'], visivelParaEquipe: false },
      { visivelPara: [], visivelParaEquipe: true },
    ]

    const total = contarPessoasComAcesso(acessos, ['user-1', 'user-2', 'user-3', 'user-4'], 'dono-unidade')
    // dono-unidade + user-1, user-2, user-3, user-4
    expect(total).toBe(5)
  })

  it('usa frases oficiais de evento e filtra indicadores da rede', () => {
    expect(textoEventoAcesso('revelou')).toBe('Visualizou a senha.')
    expect(textoEventoAcesso('copiou')).toBe('Copiou a senha.')
    const lista = [
      { escopo: 'rede' as const },
      { escopo: 'unidade' as const },
      { escopo: 'rede' as const },
    ]
    expect(acessosParaIndicadores(lista, true)).toHaveLength(2)
    expect(acessosParaIndicadores(lista, false)).toHaveLength(3)
  })

  it('restringe a gestão do cofre: unidade só com o franqueado e rede com a franqueadora', () => {
    const unidade = { escopo: 'unidade', unidadeId: 'un-1' }
    const rede = { escopo: 'rede', unidadeId: '' }
    const franqueado = { uid: 'fr', papel: 'franqueado', unidadeId: 'un-1', modulosLiberados: ['senhas'] }
    const admin = { uid: 'ad', papel: 'admin', unidadeId: null, modulosLiberados: [] }
    const equipeRede = { uid: 'eq', papel: 'equipe_franqueadora', unidadeId: null, modulosLiberados: ['senhas'] }
    expect(podeGerenciarAcesso(franqueado, unidade)).toBe(true)
    expect(podeGerenciarAcesso(admin, unidade)).toBe(false)
    expect(podeGerenciarAcesso(equipeRede, unidade)).toBe(false)
    expect(podeGerenciarAcesso(admin, rede)).toBe(true)
    expect(podeGerenciarAcesso(equipeRede, rede)).toBe(true)
    expect(podeGerenciarAcesso(franqueado, rede)).toBe(false)
    expect(podeGerenciarAcesso(franqueado, unidade, true)).toBe(false)
  })
})
