import { JSDOM } from 'jsdom'

const exclusivo = /\bCOF\b|Circular de Oferta|Apresentação Franquia|Ficha de Qualificação|\bModalidade [PMG]\b|R\$ ?(290|500|750) mil|145 boxes|ocupação média de 98/i

export function verificarConteudoPacote(pacote) {
  const campos = [[pacote, 'pacote']]
  while (campos.length) {
    const [valor, caminho] = campos.pop()
    if (typeof valor === 'string') {
      const texto = /[<&]/.test(valor) ? JSDOM.fragment(valor).textContent.replace(/\u00a0/g, ' ') : valor
      if (exclusivo.test(valor) || exclusivo.test(texto)) {
        throw new Error(`Campo ${caminho} contém conteúdo exclusivo da franqueadora.`)
      }
    } else if (valor && typeof valor === 'object') {
      for (const [chave, campo] of Object.entries(valor)) campos.push([campo, `${caminho}.${chave}`])
    }
  }
}
