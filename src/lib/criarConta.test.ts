import { describe, expect, it, vi } from 'vitest'
import { erroCadastroIncompleto, gravarOuApagarLogin } from './criarConta'

describe('cadastro com login provisório', () => {
  it('devolve o resultado quando a gravação funciona e não apaga o login', async () => {
    const apagar = vi.fn(async () => undefined)
    await expect(gravarOuApagarLogin(apagar, async () => 'uid-1')).resolves.toBe('uid-1')
    expect(apagar).not.toHaveBeenCalled()
  })

  it('apaga o login ainda autenticado quando a gravação falha', async () => {
    const apagar = vi.fn(async () => undefined)
    await expect(gravarOuApagarLogin(apagar, async () => {
      throw new Error('Missing or insufficient permissions.')
    })).rejects.toThrow(/O login provisório foi apagado.*Missing or insufficient permissions/)
    expect(apagar).toHaveBeenCalledOnce()
  })

  it('avisa quando não consegue apagar o login órfão', async () => {
    const apagar = vi.fn(async () => {
      throw new Error('rede')
    })
    await expect(gravarOuApagarLogin(apagar, async () => {
      throw new Error('falha no Firestore')
    })).rejects.toThrow(/Não foi possível apagar o login provisório.*falha no Firestore/)
  })

  it('monta a frase do erro', () => {
    expect(erroCadastroIncompleto(new Error('negado'), true).message).toContain('foi apagado')
    expect(erroCadastroIncompleto('x', false).message).toContain('Não foi possível apagar')
  })
})
