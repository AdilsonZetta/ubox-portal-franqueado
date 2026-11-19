import { describe, expect, it } from 'vitest'
import { filtrarAcessosCofre, MAX_VISIVEL_PARA } from '../data/senhas'
import { bloqueioAprovarPedido, MENSAGEM_VISIVEL_CHEIO } from './senhas'
import { proximoFoco } from './focusTrap'

describe('Aprovar pedido de acesso com a lista cheia', () => {
  const cheia = Array.from({ length: MAX_VISIVEL_PARA }, (_, i) => `uid-${i}`)

  it('bloqueia quem ainda não está na lista quando já há 20 pessoas', () => {
    expect(bloqueioAprovarPedido(cheia, 'novo')).toBe(MENSAGEM_VISIVEL_CHEIO)
    expect(MENSAGEM_VISIVEL_CHEIO).toContain('20 pessoas')
  })

  it('não bloqueia quem já está na lista nem lista com vaga', () => {
    expect(bloqueioAprovarPedido(cheia, 'uid-3')).toBeNull()
    expect(bloqueioAprovarPedido(cheia.slice(0, 19), 'novo')).toBeNull()
  })
})

describe('Tabela do cofre usa a mesma base dos indicadores', () => {
  const lista = [
    { escopo: 'rede', nome: 'ERP', responsavelNome: 'Franqueadora', categoria: 'gestao' },
    { escopo: 'unidade', nome: 'Instagram', responsavelNome: 'Ana', categoria: 'redes_sociais' },
    { escopo: 'rede', nome: 'E-mail', responsavelNome: 'TI', categoria: 'email' },
  ]

  it('na visão da rede mostra só sistemas da rede', () => {
    expect(filtrarAcessosCofre(lista, { visaoRede: true }).map((a) => a.nome)).toEqual(['ERP', 'E-mail'])
  })

  it('na visão da unidade mostra tudo e aplica busca e categoria', () => {
    expect(filtrarAcessosCofre(lista, { visaoRede: false })).toHaveLength(3)
    expect(filtrarAcessosCofre(lista, { visaoRede: false, busca: 'ana' }).map((a) => a.nome)).toEqual(['Instagram'])
    expect(filtrarAcessosCofre(lista, { visaoRede: true, categoria: 'redes_sociais' })).toHaveLength(0)
  })
})

describe('Focus trap dos diálogos', () => {
  const a = { id: 'a' } as unknown as HTMLElement
  const b = { id: 'b' } as unknown as HTMLElement
  const c = { id: 'c' } as unknown as HTMLElement

  it('Tab no último volta ao primeiro e Shift+Tab no primeiro vai ao último', () => {
    expect(proximoFoco([a, b, c], c, false)).toBe(a)
    expect(proximoFoco([a, b, c], a, true)).toBe(c)
  })

  it('no meio deixa o navegador seguir e de fora puxa para dentro', () => {
    expect(proximoFoco([a, b, c], b, false)).toBeNull()
    expect(proximoFoco([a, b, c], null, false)).toBe(a)
    expect(proximoFoco([], a, false)).toBeNull()
  })
})
