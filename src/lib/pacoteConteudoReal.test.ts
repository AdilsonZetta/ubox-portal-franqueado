// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
// @vitest-environment jsdom
import arquivo from '../../content/pacotes/ubox-conteudo-2026-11.json?raw'
import { describe, expect, it } from 'vitest'
import { sanitizarHtml } from './html'
import { aplicarSumario } from './text'
import { MAX_BYTES_PACOTE, validarPacote } from './pacoteConteudo'

function fragmentoHtml(html: string) {
  const template = document.createElement('template')
  template.innerHTML = html
  return template.content
}

function carregarPacote() {
  expect(new TextEncoder().encode(arquivo).byteLength).toBeLessThanOrEqual(MAX_BYTES_PACOTE)
  const resultado = validarPacote(JSON.parse(arquivo))
  if (!resultado.ok) throw new Error(resultado.erros.join('\n'))
  return resultado.pacote
}

describe('pacote real da Rede UBOX', () => {
  it('é aceito pelo importador e inclui todos os materiais previstos', () => {
    const pacote = carregarPacote()
    expect(pacote.categorias).toHaveLength(10)
    expect(pacote.documentos.filter(({ tipo }) => tipo === 'manual')).toHaveLength(7)
    expect(pacote.documentos.filter(({ tipo }) => tipo === 'pop')).toHaveLength(61)
    expect(pacote.documentos.filter(({ tipo }) => tipo === 'html')).toHaveLength(2)
    expect(pacote.trilha).toHaveLength(7)
    expect(pacote.cursos).toHaveLength(7)
    expect(pacote.checklists).toHaveLength(6)
  })

  it('mantém as pendências em rascunho e exclui conteúdo exclusivo da franqueadora', () => {
    // A designação "Modalidade P" é uma expressão completa.
    const exclusivo = /\bCOF\b|Circular de Oferta|Apresentação Franquia|Ficha de Qualificação|\bModalidade [PMG]\b|R\$ ?(290|500|750) mil|145 boxes|ocupação média de 98/i
    const pacote = carregarPacote()
    for (const documento of pacote.documentos) {
      const html = documento.conteudoHtml ?? documento.htmlConteudo ?? ''
      const texto = fragmentoHtml(html).textContent ?? ''
      expect(documento.titulo, documento.chave).not.toMatch(exclusivo)
      expect(texto, documento.chave).not.toMatch(exclusivo)
      expect(documento.status, documento.chave).toBe(texto.includes('[A DEFINIR') ? 'rascunho' : 'publicado')
    }
  })

  it('tem uma única alternativa correta por pergunta e acompanha a publicação do manual', () => {
    const pacote = carregarPacote()
    for (const curso of pacote.cursos) {
      const { prova } = curso
      if (!prova) throw new Error(`Prova ausente no curso ${curso.chave}`)
      expect(curso.aulas).toEqual([prova.manualRetorno])
      const manual = pacote.documentos.find(({ chave }) => chave === prova.manualRetorno)
      expect(manual?.tipo).toBe('manual')
      expect(curso.publicado).toBe(manual?.status === 'publicado')
      expect(prova.publicado).toBe(curso.publicado)
      expect(pacote.trilha.find(({ documento }) => documento === manual?.chave)?.ativo).toBe(curso.publicado)
      for (const pergunta of prova.perguntas) {
        expect(pergunta.opcoes).toHaveLength(4)
        expect(Number.isInteger(pergunta.correta)).toBe(true)
        const resposta = pergunta.opcoes[pergunta.correta]
        expect(resposta).toBeDefined()
        expect(pergunta.opcoes.filter((opcao) => opcao.trim() === resposta?.trim())).toHaveLength(1)
      }
    }
  })

  it('usa HTML sanitizado com âncoras válidas e interativos autocontidos', () => {
    for (const documento of carregarPacote().documentos) {
      if (documento.formato === 'html') {
        expect(documento.htmlConteudo, documento.chave).not.toMatch(/fetch\(|XMLHttpRequest|eval\(|https?:\/\//i)
        continue
      }
      const html = documento.conteudoHtml ?? ''
      expect(html, documento.chave).not.toMatch(/<script/i)
      expect(sanitizarHtml(html), documento.chave).toBe(html)
      const fragmento = fragmentoHtml(sanitizarHtml(aplicarSumario(html).html))
      for (const link of fragmento.querySelectorAll('a[href^="#"]')) {
        const id = link.getAttribute('href')!.slice(1)
        expect(fragmento.querySelector(`[id="${id}"]`), `${documento.chave}#${id}`).not.toBeNull()
      }
    }
  })
})
