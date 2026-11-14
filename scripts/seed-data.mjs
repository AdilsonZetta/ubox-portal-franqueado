export const CATEGORIAS = [
  ['institucional', '01 Institucional e Boas-vindas', 1, 'História da Ubox, boas-vindas e combinados da rede.'],
  ['implantacao', '02 Implantação', 2, 'Abertura da unidade, obra, fornecedores e pré-operação.'],
  ['operacao', '03 Operação', 3, 'POPs do dia a dia: abertura, fechamento, boxes e atendimento.'],
  ['equipe', '04 Equipe', 4, 'Papéis, escala, contratação e rotina da equipe de loja.'],
  ['marketing', '05 Marketing', 5, 'Marca, campanhas, redes e materiais de venda.'],
  ['financeiro', '06 Financeiro', 6, 'Repasse, taxas, fluxo de caixa e obrigações.'],
  ['treinamento', '07 Treinamento', 7, 'Trilhas, integração e capacitação do time.'],
  ['suporte', '08 Suporte e Consultoria de Campo', 8, 'Visitas, consultoria da franqueadora e canais de ajuda.'],
  ['expansao-juridico', '09 Expansão e Jurídico', 9, 'Contratos, expansão e cuidados jurídicos.'],
]

export const HTML_TOUR = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<style>
  body { margin: 0; font-family: Inter, sans-serif; background: #f5f6f4; color: #2a2e2e; }
  .cena { padding: 28px; }
  h1 { font-size: 1.4rem; margin: 0 0 8px; }
  .caixa { margin: 24px 0; height: 88px; border: 3px solid #f37021; border-radius: 12px; overflow: hidden; background: white; }
  .carga { height: 100%; width: 0; background: #9dbe2e; animation: enche 1.4s ease forwards; }
  @keyframes enche { to { width: var(--alvo, 40%); } }
  .acoes { display: flex; gap: 8px; }
  button { background: #f37021; color: white; border: 0; border-radius: 10px; padding: 10px 14px; font-weight: 700; }
  button.sec { background: #2a2e2e; }
  .passo { font-size: 12px; letter-spacing: .14em; text-transform: uppercase; color: #d85a10; font-weight: 700; }
</style>
</head>
<body>
  <div class="cena">
    <p class="passo" id="passo"></p>
    <h1 id="titulo"></h1>
    <p id="texto"></p>
    <div class="caixa"><div class="carga" id="carga"></div></div>
    <div class="acoes">
      <button class="sec" id="ant" type="button">Anterior</button>
      <button id="prox" type="button">Próximo</button>
    </div>
  </div>
  <script>
    const passos = [
      ['Chegada', 'Confira a fachada, a limpeza da recepção e se o CFTV está gravando.', '25%'],
      ['Corredor', 'Caminhe o corredor: luz acesa, piso seco, nenhum box com a porta encostada sem cadeado.', '50%'],
      ['Box', 'O cliente é o único com a chave. Não abra um box ocupado sem autorização registrada.', '75%'],
      ['Registro', 'Anote a visita no livro da unidade e avise a franqueadora se algo fugir do padrão.', '100%']
    ]
    let i = 0
    function mostrar() {
      document.getElementById('passo').textContent = 'Passo ' + (i + 1) + ' de ' + passos.length
      document.getElementById('titulo').textContent = passos[i][0]
      document.getElementById('texto').textContent = passos[i][1]
      const carga = document.getElementById('carga')
      carga.style.setProperty('--alvo', passos[i][2])
      carga.style.animation = 'none'
      void carga.offsetWidth
      carga.style.animation = ''
    }
    document.getElementById('prox').onclick = () => { i = Math.min(passos.length - 1, i + 1); mostrar() }
    document.getElementById('ant').onclick = () => { i = Math.max(0, i - 1); mostrar() }
    mostrar()
  </script>
</body>
</html>`

const checklist = (itens) =>
  `<ul data-type="taskList">${itens
    .map(
      (item) =>
        `<li data-type="taskItem" data-checked="false"><label><input type="checkbox"><span></span></label><div><p>${item}</p></div></li>`,
    )
    .join('')}</ul>`

export const DOCUMENTOS = [
  {
    id: 'doc-boas-vindas',
    categoriaId: 'institucional',
    tipo: 'manual',
    formato: 'richtext',
    status: 'publicado',
    leituraObrigatoria: true,
    titulo: 'Boas-vindas ao franqueado Ubox',
    html: `<h1>Boas-vindas à rede Ubox</h1><p>Este texto é um <strong>modelo</strong>. A versão oficial entra quando a franqueadora importar os manuais definitivos.</p><p>A Ubox é a self storage pioneira de Uberaba/MG, com monitoramento 24h, contrato sem fiador e boxes a partir de 1 m³. A unidade matriz fica na Rua Felício Abrão Sobrinho, 633, Cidade Jardim.</p><h2>O que este portal guarda</h2><ul><li>POPs da operação diária</li><li>Políticas de marca e atendimento</li><li>Trilhas de integração da equipe</li></ul><h2>Combinado</h2><p>O que está publicado e aceito aqui é o padrão da rede. Dúvida de loja vai para o suporte da franqueadora antes de virar exceção local.</p>`,
  },
  {
    id: 'doc-pop-abertura',
    categoriaId: 'operacao',
    tipo: 'pop',
    formato: 'richtext',
    status: 'publicado',
    leituraObrigatoria: false,
    titulo: 'POP de abertura da unidade',
    html: `<h1>POP — Abertura da unidade</h1><p><strong>Responsável:</strong> quem abre a loja.</p><p><strong>Horário de referência da matriz (Uberaba):</strong> segunda a sexta, 08h–18h; sábado, 08h–12h. Ajuste se a sua unidade tiver outro expediente.</p><h2>Antes de abrir a porta</h2><ol><li>Desarmar somente as áreas previstas e conferir o painel do alarme.</li><li>Olhar o CFTV da madrugada e anotar qualquer ocorrência.</li><li>Acender corredores, testar um acesso e deixar a recepção pronta.</li></ol><h2>Horários de referência</h2><table><thead><tr><th>Dia</th><th>Expediente da matriz</th></tr></thead><tbody><tr><td>Segunda a sexta</td><td>08h às 18h</td></tr><tr><td>Sábado</td><td>08h às 12h</td></tr></tbody></table><p>Conteúdo de exemplo para a implantação do portal.</p>`,
  },
  {
    id: 'doc-checklist-fechamento',
    categoriaId: 'operacao',
    tipo: 'checklist',
    formato: 'richtext',
    status: 'publicado',
    leituraObrigatoria: false,
    titulo: 'Checklist de fechamento',
    html: `<h1>Checklist de fechamento</h1><p>Marque na hora. O visto fica neste aparelho e não substitui o registro da unidade.</p>${checklist([
      'Nenhum cliente permanece na área dos boxes',
      'Portas de box ocupado estão fechadas',
      'Recepção trancada e alarme testado',
      'Ocorrência do dia anotada',
    ])}`,
  },
  {
    id: 'doc-politica-marca',
    categoriaId: 'marketing',
    tipo: 'politica',
    formato: 'richtext',
    status: 'publicado',
    leituraObrigatoria: true,
    titulo: 'Política de uso da marca Ubox',
    html: `<h1>Política de uso da marca</h1><p>A marca Ubox Self Storage é da franqueadora. Anúncios, fachada, uniforme e redes da unidade seguem o padrão enviado pelo marketing.</p><h2>Permitido</h2><ul><li>Usar os arquivos oficiais de logo e as cores da rede (laranja, verde e carvão).</li><li>Divulgar a unidade com o nome Ubox e a cidade.</li></ul><h2>Não permitido</h2><ul><li>Redesenhar o logo ou criar uma marca paralela para a unidade.</li><li>Publicar preço diferente do combinado com a franqueadora.</li></ul><p>Modelo para aceite. A versão jurídica definitiva substitui este texto.</p>`,
  },
  {
    id: 'doc-tour-unidade',
    categoriaId: 'implantacao',
    tipo: 'html',
    formato: 'html',
    status: 'publicado',
    leituraObrigatoria: false,
    titulo: 'Tour interativo da unidade',
    html: '<p>Versão em página para quem não abrir o manual animado.</p>',
    htmlConteudo: HTML_TOUR,
  },
  {
    id: 'doc-repasse-modelo',
    categoriaId: 'financeiro',
    tipo: 'processo',
    formato: 'richtext',
    status: 'rascunho',
    leituraObrigatoria: false,
    titulo: 'Repasse à franqueadora — rascunho',
    html: `<h1>Repasse</h1><p>Rascunho interno. Não aparece para o franqueado enquanto não for publicado.</p><p>Quando a planilha oficial existir, cole aqui o link do Google Drive.</p>`,
  },
]

export const QUIZ = {
  id: 'quiz-integracao',
  titulo: 'Quiz de integração do franqueado',
  perguntas: [
    {
      id: 'q1',
      enunciado: 'Onde fica a unidade matriz da Ubox citada no material de boas-vindas?',
      opcoes: ['Franca/SP', 'Rua Felício Abrão Sobrinho, 633, Uberaba', 'Montes Claros/MG', 'Varginha/MG'],
      correta: 1,
    },
    {
      id: 'q2',
      enunciado: 'No POP de abertura, o que fazer com o CFTV antes de abrir a porta?',
      opcoes: ['Desligar as câmeras', 'Olhar a gravação da madrugada e anotar ocorrências', 'Apagar as imagens da semana', 'Entregar a senha ao cliente'],
      correta: 1,
    },
    {
      id: 'q3',
      enunciado: 'Quem pode abrir um box ocupado?',
      opcoes: ['Qualquer pessoa da recepção, a qualquer momento', 'Somente com autorização registrada; a chave do box é do cliente', 'O vizinho de box', 'O entregador'],
      correta: 1,
    },
    {
      id: 'q4',
      enunciado: 'O que a política de marca pede antes de um anúncio da unidade?',
      opcoes: ['Criar um logo novo da unidade', 'Usar os arquivos oficiais e as cores da rede', 'Publicar qualquer preço', 'Tirar o nome Ubox'],
      correta: 1,
    },
  ],
}

export const TRILHA = {
  id: 'trilha-integracao',
  titulo: 'Integração do franqueado',
  descricao: 'Leia as boas-vindas, o POP de abertura e faça o quiz. Nota mínima 70.',
  notaMinima: 70,
  itens: [
    { id: 'etapa-boas-vindas', tipo: 'documento', refId: 'doc-boas-vindas', titulo: 'Boas-vindas ao franqueado Ubox' },
    { id: 'etapa-abertura', tipo: 'documento', refId: 'doc-pop-abertura', titulo: 'POP de abertura da unidade' },
    { id: 'etapa-quiz', tipo: 'quiz', refId: 'quiz-integracao', titulo: 'Quiz de integração do franqueado' },
  ],
}
