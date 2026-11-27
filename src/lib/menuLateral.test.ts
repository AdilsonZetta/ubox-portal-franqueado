import { expect, it } from 'vitest'
import { expandidoAposNavegar, moduloMenuAberto, proximoModuloExpandido } from './menuLateral'

it('no Painel os grupos começam fechados, mesmo com um módulo salvo', () => {
  expect(expandidoAposNavegar('/', null)).toBe('')
  expect(moduloMenuAberto('', 'manuais')).toBe(false)
  expect(moduloMenuAberto('manuais', 'manuais')).toBe(true)
})

it('no Painel o clique abre o grupo e o segundo clique fecha', () => {
  const aposPainel = expandidoAposNavegar('/', null) ?? ''
  const aberto = proximoModuloExpandido(aposPainel, 'manuais')
  expect(aberto).toBe('manuais')
  expect(moduloMenuAberto(aberto, 'manuais')).toBe(true)
  expect(moduloMenuAberto(aberto, 'senhas')).toBe(false)
  expect(proximoModuloExpandido(aberto, 'manuais')).toBe('')
})

it('numa rota de módulo o grupo correspondente abre', () => {
  expect(expandidoAposNavegar('/senhas', 'senhas')).toBe('senhas')
  expect(moduloMenuAberto('senhas', 'senhas')).toBe(true)
  expect(moduloMenuAberto('senhas', 'manuais')).toBe(false)
})

it('em rotas sem módulo, como Demandas, o estado atual se mantém', () => {
  expect(expandidoAposNavegar('/demandas', null)).toBeUndefined()
  expect(moduloMenuAberto('chamados', 'chamados')).toBe(true)
})
