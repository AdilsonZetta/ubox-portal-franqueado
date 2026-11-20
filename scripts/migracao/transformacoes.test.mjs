// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { readFileSync } from 'node:fs'
import { validarParesCrm } from './transformacoes/crm.mjs'
import { uuidDocumento } from './transformacoes/base.mjs'
import { describe, expect, it } from 'vitest'
import { modulos } from './transformacoes/index.mjs'

describe('transformações da carga', () => {
  const uuid = '80e3a002-2bd5-44ef-a17d-b329923f31a0'
  const ctx = { uid: uid => uid === 'autor' ? uuid : null, temDocumento: () => false }
  for (const [modulo, colecao, tabela, campo, rejeitado] of [
    ['manuais', 'documentos', 'documentos', 'status', 'inválido'],
    ['universidade', 'reestudos', 'reestudos', 'status', 'inválido'],
    ['chamados', 'chamados', 'chamados', 'status', 'inválido'],
    ['senhas', 'acessos', 'acessos', 'escopo', 'inválido'],
    ['marketing', 'marketingMateriais', 'marketing_materiais', 'tipo', 'inválido'],
    ['checklist', 'checklistModelos', 'checklist_modelos', 'tipo', 'inválido'],
    ['auditoria', 'auditorias', 'auditorias', 'status', 'inválido'],
    ['acompanhamento', 'acompanhamentoRegistros', 'acompanhamento_registros', 'tipo', 'inválido'],
    ['estoque', 'estoqueMovimentos', 'estoque_movimentos', 'tipo', 'inválido'],
    ['crm', 'crmLeads', 'crm_leads', 'etapa', 'inválido'],
    ['cliente', 'clientes', 'clientes', 'status', 'inválido'],
    ['nuvem', 'nuvemLinks', 'nuvem_links', 'visibilidade', 'inválido'],
  ]) {
    it(modulo + ' registra enum inválido e identifica a tabela de destino', () => {
      const path = colecao + '/teste'
      const transformar = modulos[modulo][colecao].transformar
      const resultado = transformar({ path, id: 'teste', data: { [campo]: rejeitado, extra: true } }, ctx)
      expect(resultado.linhas).toEqual([])
      expect(resultado.pendencias).toContainEqual(expect.objectContaining({ tabela, campo, motivo: 'enum inválido' }))
      expect(resultado.desconhecidos).toEqual(['extra'])
    })
  }
})

const pasta = new URL('./exemplo-carga/', import.meta.url)
const manifesto = JSON.parse(readFileSync(new URL('manifest.json', pasta)))
const arquivos = new Map(Object.entries(manifesto.colecoes).map(([arquivo, rota]) => [rota.join('/'), arquivo]))
function documento(colecao) {
  const texto = readFileSync(new URL(arquivos.get(colecao), pasta), 'utf8')
  return JSON.parse(texto.split('\n')[0])
}

const autor = '80e3a002-2bd5-44ef-a17d-b329923f31a0'
const contexto = { uid: uid => uid === 'autor' ? autor : null }
const dataEsperada = doc => {
  const timestamp = Object.values(doc.data).find(v => v?.__tipo === 'timestamp')
  return new Date(timestamp.s * 1000).toISOString().replace('.000Z', '.123456Z')
}

describe('carimbo e autoria por módulo', () => {
  for (const [modulo, colecao, data, uid, coluna, anulavel] of [
    ['manuais', 'documentos', 'criado_em', 'atualizadoPor', 'atualizado_por', true],
    ['universidade', 'cursos', 'atualizado_em', 'atualizadoPor', 'atualizado_por', true],
    ['chamados', 'chamados', 'criado_em', 'abertoPor', 'aberto_por'],
    ['senhas', 'acessos/segredo', 'atualizado_em', 'atualizadoPor', 'atualizado_por'],
    ['marketing', 'marketingMateriais', 'criado_em', 'atualizadoPor', 'atualizado_por'],
    ['checklist', 'checklistModelos', 'criado_em', 'atualizadoPor', 'atualizado_por'],
    ['auditoria', 'auditorias', 'data_visita', 'auditorUid', 'auditor_uid'],
    ['acompanhamento', 'acompanhamentoRegistros', 'data', 'autorUid', 'autor_uid'],
    ['estoque', 'estoqueMovimentos', 'criado_em', 'uid', 'uid'],
    ['crm', 'crmLeads', 'criado_em', 'responsavelUid', 'responsavel_uid'],
    ['cliente', 'clientes', 'contrato_inicio', 'atualizadoPor', 'atualizado_por'],
    ['nuvem', 'nuvemLinks', 'criado_em', 'criadoPor', 'criado_por'],
  ]) {
    const transformar = modulos[modulo][colecao].transformar
    it(modulo + ' preserva a data e traduz a autoria', () => {
      const doc = documento(colecao)
      const resultado = transformar(doc, contexto)
      expect(resultado.pendencias).toEqual([])
      expect(resultado.desconhecidos).toEqual([])
      expect(resultado.linhas[0].linha).toMatchObject({ [data]: dataEsperada(doc), [coluna]: autor })
    })
    it(modulo + ' registra um autor ausente do mapa', () => {
      const doc = documento(colecao)
      doc.data[uid] = 'sem-perfil'
      const resultado = transformar(doc, contexto)
      expect(resultado.pendencias).toEqual([expect.objectContaining({ campo: uid, motivo: 'UID sem correspondência' })])
      if (anulavel) expect(resultado.linhas[0].linha[coluna]).toBeNull()
      else expect(resultado.linhas).toEqual([])
    })
  }
})

it('isola os contatos embutidos de leads legados na tabela restrita', () => {
  const doc = documento('crmLeads')
  const contato = documento('crmContatos').data
  const resultado = modulos.crm.crmLeads.transformar({ ...doc, data: { ...doc.data, ...contato } }, contexto)
  expect(resultado.pendencias).toEqual([])
  const [lead, pessoal] = resultado.linhas
  expect(lead.tabela).toBe('crm_leads')
  expect(JSON.stringify(lead.linha)).not.toMatch(/telefone|email|example\.com|99123/)
  expect(pessoal).toMatchObject({ tabela: 'crm_contatos', linha: {
    id: lead.linha.id, unidade_id: lead.linha.unidade_id, email: contato.email, telefone: contato.telefone,
  } })
})

it('isola o e-mail, telefone e nome completo no cadastro do cliente', () => {
  const doc = documento('clientes')
  const painel = documento('clientePaineis')
  const { nome, email, telefone } = doc.data
  Object.assign(painel.data, { nome, email, telefone })
  const [cliente] = modulos.cliente.clientes.transformar(doc, contexto).linhas
  const resultado = modulos.cliente.clientePaineis.transformar(painel, contexto)
  expect(cliente.linha).toMatchObject({ nome, email, telefone })
  expect(resultado.desconhecidos).toEqual(['email', 'nome', 'telefone'])
  expect(resultado.linhas[0].linha).not.toHaveProperty('email')
  expect(resultado.linhas[0].linha).not.toHaveProperty('telefone')
  expect(resultado.linhas[0].linha).not.toHaveProperty('nome')
})

it('isola login, senha e notas na tabela de segredos', () => {
  const segredo = documento('acessos/segredo')
  const acesso = documento('acessos')
  const { login, senha, notas } = segredo.data
  Object.assign(acesso.data, { login, senha, notas })
  const resultado = modulos.senhas.acessos.transformar(acesso, contexto)
  expect(resultado.desconhecidos).toEqual(['login', 'notas', 'senha'])
  expect(resultado.linhas[0].linha).not.toHaveProperty('login')
  expect(resultado.linhas[0].linha).not.toHaveProperty('senha')
  expect(resultado.linhas[0].linha).not.toHaveProperty('notas')
  expect(modulos.senhas['acessos/segredo'].transformar(segredo, contexto).linhas[0].linha)
    .toMatchObject({ acesso_id: acesso.id, login, senha, notas })
})

it('deriva UUID v5 estável do caminho inteiro', () => {
  const id = uuidDocumento('acessos/primeiro/eventos/evento')
  expect(id).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-5[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/)
  expect(uuidDocumento('acessos/primeiro/eventos/evento')).toBe(id)
  expect(uuidDocumento('acessos/segundo/eventos/evento')).not.toBe(id)
})

it('registra o lead cujo contato pertence a outra unidade', () => {
  const doc = documento('crmLeads')
  const pessoal = documento('crmContatos')
  pessoal.data.unidadeId = 'outra-unidade'
  const candidatas = [
    ...modulos.crm.crmLeads.transformar(doc, contexto).linhas,
    ...modulos.crm.crmContatos.transformar(pessoal, contexto).linhas,
  ]
  const pendencias = []
  const linhas = validarParesCrm(candidatas, pendencias)
  expect(linhas.map(item => item.tabela)).toEqual(['crm_contatos'])
  expect(pendencias).toEqual([expect.objectContaining({
    tabela: 'crm_leads', motivo: 'contato CRM correspondente ausente ou inválido',
  })])
})
