export interface ModeloDocumento {
  id: string
  nome: string
  tipo: 'pop' | 'manual' | 'processo' | 'politica' | 'checklist'
  html: string
}

const item = (texto: string) =>
  `<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>${texto}</p></div></li>`

export const MODELOS: ModeloDocumento[] = [
  {
    id: 'pop',
    nome: 'POP',
    tipo: 'pop',
    html: `<h1>POP — título do procedimento</h1><p><strong>Objetivo:</strong> descrever o resultado esperado.</p><p><strong>Responsável:</strong> gerente da unidade.</p><p><strong>Quando aplicar:</strong> </p><h2>Materiais</h2><ul><li>Item</li></ul><h2>Passo a passo</h2><ol><li>Primeiro passo</li><li>Segundo passo</li><li>Registro do que foi feito</li></ol><h2>Checklist</h2><ul data-type="taskList">${item('Conferido')}${item('Registrado')}</ul><h2>Exceções</h2><p>O que fazer quando o passo não puder ser cumprido e quem acionar na franqueadora.</p>`,
  },
  {
    id: 'manual',
    nome: 'Manual',
    tipo: 'manual',
    html: `<h1>Manual — título</h1><p>Para quem é este manual e o que a pessoa consegue fazer depois de lê-lo.</p><h2>Contexto</h2><p></p><h2>Como fazer</h2><ol><li></li></ol><h2>Erros comuns</h2><ul><li></li></ul><h2>Onde pedir ajuda</h2><p>Suporte da franqueadora e consultoria de campo.</p>`,
  },
  {
    id: 'politica',
    nome: 'Política',
    tipo: 'politica',
    html: `<h1>Política — título</h1><p><strong>Vigência:</strong> a partir da publicação desta versão.</p><p><strong>Abrangência:</strong> todas as unidades da rede Ubox.</p><h2>Regra</h2><p></p><h2>O que é permitido</h2><ul><li></li></ul><h2>O que não é permitido</h2><ul><li></li></ul><h2>Consequências</h2><p></p>`,
  },
  {
    id: 'processo',
    nome: 'Processo',
    tipo: 'processo',
    html: `<h1>Processo — título</h1><p><strong>Entrada:</strong> </p><p><strong>Saída:</strong> </p><h2>Fluxo</h2><ol><li>Quem começa</li><li>Quem valida</li><li>Onde fica o registro</li></ol><h2>Prazos</h2><p></p>`,
  },
  {
    id: 'checklist',
    nome: 'Checklist',
    tipo: 'checklist',
    html: `<h1>Checklist — título</h1><p>Use na operação. O estado dos itens fica neste aparelho e não substitui o aceite do documento.</p><ul data-type="taskList">${item('Item 1')}${item('Item 2')}${item('Item 3')}</ul>`,
  },
]
