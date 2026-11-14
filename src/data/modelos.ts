export interface ModeloDocumento {
  id: string
  nome: string
  area: string
  tipo: 'pop' | 'manual' | 'processo' | 'politica' | 'checklist'
  html: string
}

const item = (texto: string) =>
  `<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>${texto}</p></div></li>`

export const MODELOS: ModeloDocumento[] = [
  {
    id: 'pop',
    nome: 'POP',
    area: 'Operação',
    tipo: 'pop',
    html: `<h1>POP — título do procedimento</h1><p><strong>Objetivo:</strong> descrever o resultado esperado.</p><p><strong>Responsável:</strong> gerente da unidade.</p><p><strong>Quando aplicar:</strong> </p><h2>Materiais</h2><ul><li>Item</li></ul><h2>Passo a passo</h2><ol><li>Primeiro passo</li><li>Segundo passo</li><li>Registro do que foi feito</li></ol><h2>Checklist</h2><ul data-type="taskList">${item('Conferido')}${item('Registrado')}</ul><h2>Exceções</h2><p>O que fazer quando o passo não puder ser cumprido e quem acionar na franqueadora.</p>`,
  },
  {
    id: 'manual',
    nome: 'Manual',
    area: 'Treinamento',
    tipo: 'manual',
    html: `<h1>Manual — título</h1><p>Para quem é este manual e o que a pessoa consegue fazer depois de lê-lo.</p><h2>Contexto</h2><p></p><h2>Como fazer</h2><ol><li></li></ol><h2>Erros comuns</h2><ul><li></li></ul><h2>Onde pedir ajuda</h2><p>Suporte da franqueadora e consultoria de campo.</p>`,
  },
  {
    id: 'politica',
    nome: 'Política',
    area: 'Institucional',
    tipo: 'politica',
    html: `<h1>Política — título</h1><p><strong>Vigência:</strong> a partir da publicação desta versão.</p><p><strong>Abrangência:</strong> todas as unidades da rede Ubox.</p><h2>Regra</h2><p></p><h2>O que é permitido</h2><ul><li></li></ul><h2>O que não é permitido</h2><ul><li></li></ul><h2>Consequências</h2><p></p>`,
  },
  {
    id: 'processo',
    nome: 'Processo',
    area: 'Operação',
    tipo: 'processo',
    html: `<h1>Processo — título</h1><p><strong>Entrada:</strong> </p><p><strong>Saída:</strong> </p><h2>Fluxo</h2><ol><li>Quem começa</li><li>Quem valida</li><li>Onde fica o registro</li></ol><h2>Prazos</h2><p></p>`,
  },
  {
    id: 'checklist',
    nome: 'Checklist',
    area: 'Operação',
    tipo: 'checklist',
    html: `<h1>Checklist — título</h1><p>Use na operação. O estado dos itens fica neste aparelho e não substitui o aceite do documento.</p><ul data-type="taskList">${item('Item 1')}${item('Item 2')}${item('Item 3')}</ul>`,
  },
  {
    id: 'atendimento',
    nome: 'Script de atendimento',
    area: 'Atendimento',
    tipo: 'manual',
    html: `<h1>Script de atendimento na recepção</h1><p>Use com visita, WhatsApp e telefone da unidade.</p><h2>Passo a passo</h2><ol><li>Cumprimente e pergunte se a pessoa já é cliente.</li><li>Entenda o que será guardado e por quanto tempo.</li><li>Mostre o tamanho de box compatível.</li><li>Explique contrato sem fiador, acesso e monitoramento 24h.</li><li>Registre o próximo passo no sistema da unidade.</li></ol>`,
  },
  {
    id: 'fechamento',
    nome: 'Fechamento da unidade',
    area: 'Operação',
    tipo: 'pop',
    html: `<h1>POP — Fechamento da unidade</h1><p><strong>Responsável:</strong> quem fecha a loja.</p><h2>Passo a passo</h2><ol><li>Confirme que não há cliente na área dos boxes.</li><li>Percorra o corredor e veja portas e cadeados.</li><li>Tranque a recepção e teste o alarme.</li><li>Anote ocorrências do dia.</li></ol><h2>Checklist</h2><ul data-type="taskList">${item('Corredor vazio')}${item('Alarme testado')}${item('Ocorrência anotada')}</ul>`,
  },
  {
    id: 'onboarding',
    nome: 'Integração de novo franqueado',
    area: 'Treinamento',
    tipo: 'processo',
    html: `<h1>Integração de novo franqueado</h1><p>Percurso da primeira semana na rede.</p><ol><li>Ler as boas-vindas e aceitar a política de marca.</li><li>Percorrer a unidade com o tour e o POP de abertura.</li><li>Treinar a equipe de recepção no script de atendimento.</li><li>Concluir a trilha e o quiz de integração.</li></ol>`,
  },
]
