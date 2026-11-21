import { describe, expect, it } from 'vitest'
import { urlSistemaValida, mapAcesso, mapEventoAcesso, mapSegredo, mapSolicitacaoAcesso } from './senhas'

describe('Central de Acessos — Mapeamento de dados', () => {
  it('mapeia acesso válido e ignora campos inválidos', () => {
    const raw = {
      nome: 'Sistema de Gestão',
      categoria: 'gestao',
      url: 'https://gestao.ubox.com.br',
      escopo: 'unidade',
      unidadeId: 'un-1',
      unidadeNome: 'Uberaba Centro',
      responsavelId: 'user-1',
      responsavelNome: 'Carlos Mendes',
      visivelPara: ['user-2'],
      visivelParaEquipe: true,
      pendenteTroca: false,
      criadoPor: 'user-1',
      criadoPorNome: 'Carlos Mendes',
    }
    const item = mapAcesso('ac-1', raw)
    expect(item).not.toBeNull()
    expect(item?.id).toBe('ac-1')
    expect(item?.nome).toBe('Sistema de Gestão')
    expect(item?.visivelParaEquipe).toBe(true)
    expect(item?.visivelPara).toEqual(['user-2'])

    // Categoria inválida retorna null
    expect(mapAcesso('ac-2', { ...raw, categoria: 'invalida' })).toBeNull()
    // Escopo inválido retorna null
    expect(mapAcesso('ac-3', { ...raw, escopo: 'invalido' })).toBeNull()
  })

  it('mapeia segredo corretamente', () => {
    const raw = {
      login: 'admin@unidade',
      senha: 'minha-senha-secreta',
      notas: 'Acesso principal',
      atualizadoPor: 'user-1',
    }
    const segredo = mapSegredo(raw)
    expect(segredo).not.toBeNull()
    expect(segredo?.login).toBe('admin@unidade')
    expect(segredo?.senha).toBe('minha-senha-secreta')

    // Sem campo senha retorna null
    expect(mapSegredo({ login: 'teste' })).toBeNull()
  })

  it('mapeia eventos de acesso e solicitações', () => {
    const evento = mapEventoAcesso('ev-1', {
      tipo: 'revelou',
      texto: 'Visualizou a senha',
      autorId: 'user-1',
      autorNome: 'Carlos',
    })
    expect(evento).not.toBeNull()
    expect(evento?.tipo).toBe('revelou')

    const solicitacao = mapSolicitacaoAcesso('sol-1', {
      tipo: 'pedir_acesso',
      status: 'aberta',
      acessoId: 'ac-1',
      acessoNome: 'Instagram',
      unidadeId: 'un-1',
      unidadeNome: 'Uberaba Centro',
      solicitadoPor: 'user-2',
      solicitadoPorNome: 'Ana',
      motivo: 'Preciso postar stories',
      alvoUid: 'user-2',
      alvoNome: 'Ana',
    })
    expect(solicitacao).not.toBeNull()
    expect(solicitacao?.status).toBe('aberta')
  })
})

it('aceita URL HTTPS completa ou campo opcional em branco', () => {
  expect(urlSistemaValida('')).toBe(true)
  expect(urlSistemaValida('https://sistema.exemplo/entrar')).toBe(true)
  expect(urlSistemaValida('https://')).toBe(false)
  expect(urlSistemaValida('http://sistema.exemplo')).toBe(false)
  expect(urlSistemaValida('https:///sistema.exemplo')).toBe(false)
})
