// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { carregarPainelPublicoSb, criarClienteSb, lerPainelPublicoSb, trocarLinkSb } from './clienteSupabase'
import type { Cliente, Painel } from './cliente'
import type { Usuario } from '../types'

const { rpc, from } = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }))
vi.mock('./supabase', () => ({ requireSupabase: () => ({ rpc, from }) }))

const token = 'a'.repeat(32)

describe('painel público no Supabase', () => {
  beforeEach(() => vi.resetAllMocks())

  it('carrega painel e itens por token em uma única chamada', async () => {
    rpc.mockResolvedValue({ data: {
      primeiro_nome: 'Maria', unidade_nome: 'Ubox', contrato_inicio: '2026-01-01T12:00:00Z',
      cobrancas: [{ competencia: '2026-02', valor_centavos: 12990, status: 'pago' }],
      visitas: [{ data: '2026-02-01', hora: '10:00', status: 'agendada' }],
      recados: [{ texto: 'Olá', criado_em: '2026-01-02T12:00:00Z', gerado_por_ia: false }],
    }, error: null })
    const resultado = await carregarPainelPublicoSb(token)
    expect(resultado?.painel).toMatchObject({
      token, primeiroNome: 'Maria', ativo: true, clienteId: '', unidadeId: '',
      contratoInicioMs: Date.parse('2026-01-01T12:00:00Z'),
    })
    expect(resultado?.itens.cobrancas[0]).toMatchObject({ id: '2026-02', valorCentavos: 12990 })
    expect(resultado?.itens.visitas[0]).toMatchObject({ hora: '10:00' })
    expect(resultado?.itens.recados[0]).toMatchObject({ texto: 'Olá' })
    expect(rpc).toHaveBeenCalledExactlyOnceWith('painel_publico', { p_token: token })
    expect(from).not.toHaveBeenCalled()
  })

  it('ignora um token inválido sem chamar o servidor', async () => {
    expect(await lerPainelPublicoSb('abc')).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
  })

  it('trata link indisponível ou falha de leitura como null', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: null }).mockRejectedValueOnce(new Error('rede'))
    expect(await lerPainelPublicoSb(token)).toBeNull()
    expect(await lerPainelPublicoSb(token)).toBeNull()
  })
})

describe('gravação do cliente no Supabase', () => {
  beforeEach(() => vi.resetAllMocks())

  it('separa os dados pessoais do painel e cria um token de 128 bits', async () => {
    rpc.mockResolvedValue({ data: 'cliente-1', error: null })
    const id = await criarClienteSb(
      { uid: 'usuario', nome: 'Atendente', unidadeId: 'un-1', unidade: 'Ubox' } as Usuario,
      {
        nome: 'Maria Silva', telefone: '34999990000', email: 'maria@cliente.test', obs: '',
        box: 'Box 12', contratoInicio: '2026-11-01', contratoFim: '', valorMensal: '289,90', diaVencimento: '10',
      },
      'WhatsApp da unidade',
    )

    expect(id).toBe('cliente-1')
    expect(rpc).toHaveBeenCalledExactlyOnceWith('criar_cliente', {
      p_id: expect.any(String),
      p_token: expect.stringMatching(/^[0-9a-f]{32}$/),
      p_cliente: expect.objectContaining({ nome: 'Maria Silva', telefone: '34999990000', email: 'maria@cliente.test' }),
      p_painel: {
        unidade_nome: 'Ubox', primeiro_nome: 'Maria', contato_unidade: 'WhatsApp da unidade',
        box: 'Box 12', contrato_inicio: expect.any(String), contrato_fim: null,
        valor_mensal_centavos: 28990, dia_vencimento: 10, ativo: false,
      },
    })
    expect(rpc.mock.calls[0][1].p_cliente).not.toHaveProperty('atualizado_por')
    expect(from).not.toHaveBeenCalled()
  })

  it('solicita a rotação em uma única chamada com o token atual e o novo', async () => {
    rpc.mockImplementation(async (_funcao, args) => ({ data: args.p_token_novo, error: null }))
    const novo = await trocarLinkSb({ id: 'cliente-1' } as Cliente, { token } as Painel)

    expect(novo).toMatch(/^[0-9a-f]{32}$/)
    expect(rpc).toHaveBeenCalledExactlyOnceWith('trocar_link_cliente', {
      p_id: 'cliente-1', p_token_atual: token, p_token_novo: novo,
    })
    expect(from).not.toHaveBeenCalled()
  })
})
