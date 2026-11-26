import { describe, expect, it } from 'vitest'
import type { Usuario } from '../types'
import { acoesDoPortal, buscarAcoes, destinoDaBusca } from './buscaPortal'

const unidade = (modulosLiberados: string[]): Usuario => ({
  uid: 'u1', nome: 'Ana', email: 'ana@example.com', papel: 'equipe_franqueado',
  ativo: true, recusado: false, unidade: 'Unidade', cidade: 'Uberaba', modulosLiberados,
})
const opts = { ehAdmin: false, simulando: false }

describe('busca do portal', () => {
  it.each(['como abrir a loja', 'como abrir a loja?'])('usa o modo escolhido para %s', (texto) => {
    expect(destinoDaBusca(` ${texto} `, 'buscar')).toBe(`/busca?q=${encodeURIComponent(texto)}`)
    expect(destinoDaBusca(texto, 'perguntar')).toBe(`/pergunte?q=${encodeURIComponent(texto)}`)
    expect(destinoDaBusca(' ', 'buscar')).toBeNull()
  })

  it.each(['franqueado', 'equipe_franqueado'] as const)('oferece abertura de chamados para %s com o módulo', (papel) => {
    const pessoa = { ...unidade(['chamados']), papel }
    expect(buscarAcoes('abrir chamado', acoesDoPortal(pessoa, opts))[0]?.titulo).toBe('Abrir chamado')
    expect(buscarAcoes('abrir chamado', acoesDoPortal(unidade([]), opts))).toEqual([])
  })

  it('oferece acompanhamento de chamados ao admin', () => {
    const acoes = acoesDoPortal({ ...unidade([]), papel: 'admin' }, { ...opts, ehAdmin: true })
    expect(buscarAcoes('abrir chamado', acoes)[0]?.titulo).toBe('Acompanhar chamados')
    expect(acoes.map((acao) => acao.titulo)).not.toContain('Abrir chamado')
  })

  it('encontra o checklist pela rotina de abertura', () => {
    const acoes = acoesDoPortal(unidade(['checklist', 'chamados']), opts)
    expect(buscarAcoes('como abrir a loja', acoes).map((acao) => acao.titulo)).toEqual(['Fazer checklist'])
  })

  it('ignora consultas com apenas termos genéricos na busca de ações', () => {
    const acoes = acoesDoPortal(unidade(['checklist', 'chamados']), opts)
    expect(buscarAcoes('COMO abrír, fazer e ver?', acoes)).toEqual([])
  })
})
