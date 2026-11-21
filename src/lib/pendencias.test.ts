import { expect, it } from 'vitest'
import { montarPendencias } from './pendencias'

it('omite fontes vazias e prioriza atrasos sem incluir dados pessoais', () => {
  expect(montarPendencias({ avisos: 2, cobrancas: 3, chamados: 0 }).map(({ id, detalhe, para }) => ({ id, detalhe, para })))
    .toEqual([
      { id: 'cobrancas', detalhe: '3 em atraso', para: '/clientes' },
      { id: 'avisos', detalhe: '2 não lidos', para: '/notificacoes' },
    ])
  expect(montarPendencias({})).toEqual([])
})

it('prioriza as seis fontes de atraso e mantém até oito cartões', () => {
  const itens = montarPendencias({
    avisos: 1, leituras: 1, chamados: 1, checklists: 1,
    crm: 1, cobrancas: 1, auditoria: 1, acompanhamento: 1,
  })
  expect(itens).toHaveLength(8)
  expect(itens.slice(0, 6).every((item) => item.tom === 'alerta')).toBe(true)
  expect(itens.at(-1)?.detalhe).toBe('1 não lido')
})

it('conta somente aceites da versão atual feitos pelo próprio usuário', () => {
  expect(montarPendencias({
    documentos: [
      { id: 'a', status: 'publicado', leituraObrigatoria: true, versao: 2 },
      { id: 'b', status: 'publicado', leituraObrigatoria: true, versao: 2 },
      { id: 'c', status: 'rascunho', leituraObrigatoria: true, versao: 1 },
    ],
    aceites: [
      { uid: 'u1', documentoId: 'a', versao: 1 },
      { uid: 'u2', documentoId: 'a', versao: 2 },
      { uid: 'u1', documentoId: 'b', versao: 2 },
    ],
    uid: 'u1',
  })).toMatchObject([{ id: 'leituras', detalhe: '1 aguardando aceite' }])
})
