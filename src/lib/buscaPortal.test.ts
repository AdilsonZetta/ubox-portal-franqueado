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

  it('oferece abertura de chamados apenas à unidade com o módulo', () => {
    expect(buscarAcoes('abrir chamado', acoesDoPortal(unidade(['chamados']), opts))[0]?.titulo).toBe('Abrir chamado')
    expect(buscarAcoes('abrir chamado', acoesDoPortal(unidade([]), opts))).toEqual([])
  })

  it('oferece acompanhamento de chamados ao admin', () => {
    const acoes = acoesDoPortal({ ...unidade([]), papel: 'admin' }, { ...opts, ehAdmin: true })
    expect(acoes.map((acao) => acao.titulo)).toContain('Acompanhar chamados')
    expect(acoes.map((acao) => acao.titulo)).not.toContain('Abrir chamado')
  })

  it('encontra o checklist pela rotina de abertura', () => {
    expect(buscarAcoes('como abrir a loja', acoesDoPortal(unidade(['checklist']), opts))[0]?.titulo).toBe('Fazer checklist')
  })
})
