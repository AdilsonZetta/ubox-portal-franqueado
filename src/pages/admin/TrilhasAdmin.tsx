import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AudienciaFields, type AudienciaForm } from '../../components/AudienciaFields'
import { Aviso, Button, Campo, inputClass } from '../../components/ui'
import { excluirTrilha, listarQuizzesDaTrilha, listarUsuarios, salvarTrilha, type RascunhoQuiz } from '../../lib/api'
import { mensagemErro } from '../../lib/errors'
import { usePortal } from '../../lib/portal'
import type { Pergunta, TrilhaItem, Usuario } from '../../types'

function novaPergunta(): Pergunta {
  return { id: crypto.randomUUID(), enunciado: '', opcoes: ['', ''], correta: 0 }
}

export function TrilhasAdminPage() {
  const { trilhas } = usePortal()
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-extrabold">Trilhas</h1>
        <Link to="/admin/trilhas/nova" className="rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white">Nova trilha</Link>
      </div>
      <ul className="divide-y divide-line rounded-2xl border border-line bg-white">
        {trilhas.map((trilha) => (
          <li key={trilha.id}>
            <Link to={`/admin/trilhas/${trilha.id}`} className="flex items-center justify-between px-4 py-3 hover:bg-paper">
              <span className="font-medium">{trilha.titulo}</span>
              <span className="text-xs text-ink/50">{trilha.publicado ? 'Publicada' : 'Rascunho'}</span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

export default function TrilhaEditor() {
  const { id } = useParams()
  const nova = !id || id === 'nova'
  const navigate = useNavigate()
  const portal = usePortal()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [titulo, setTitulo] = useState('')
  const [descricao, setDescricao] = useState('')
  const [notaMinima, setNotaMinima] = useState(70)
  const [publicado, setPublicado] = useState(false)
  const [itens, setItens] = useState<TrilhaItem[]>([])
  const [quizzes, setQuizzes] = useState<RascunhoQuiz[]>([])
  const [audiencia, setAudiencia] = useState<AudienciaForm>({ publico: true, unidades: [], papeis: [], uidsExtra: [] })
  const [docId, setDocId] = useState('')
  const [erro, setErro] = useState('')
  const [pronto, setPronto] = useState(nova)

  useEffect(() => {
    void listarUsuarios().then(setUsuarios).catch(() => undefined)
  }, [])

  useEffect(() => {
    if (nova) return
    const trilha = portal.trilhas.find((item) => item.id === id)
    if (!trilha) return
    setTitulo(trilha.titulo)
    setDescricao(trilha.descricao)
    setNotaMinima(trilha.notaMinima)
    setPublicado(trilha.publicado)
    setItens(trilha.itens)
    setAudiencia({ publico: trilha.publico, unidades: trilha.unidades, papeis: trilha.papeis, uidsExtra: trilha.uidsExtra })
    void listarQuizzesDaTrilha(trilha.id)
      .then((lista) => {
        setQuizzes(lista.map((quiz) => ({ id: quiz.id, titulo: quiz.titulo, perguntas: quiz.perguntas })))
        setPronto(true)
      })
      .catch((falha: unknown) => setErro(mensagemErro(falha)))
  }, [id, nova, portal.trilhas])

  if (!pronto) return <p>Carregando trilha…</p>

  function adicionarQuiz() {
    const quizId = crypto.randomUUID()
    const quiz = { id: quizId, titulo: 'Novo quiz', perguntas: [novaPergunta()] }
    setQuizzes((atual) => [...atual, quiz])
    setItens((atual) => [...atual, { id: crypto.randomUUID(), tipo: 'quiz', refId: quizId, titulo: quiz.titulo }])
  }

  async function salvar() {
    setErro('')
    try {
      const itensAtuais = itens.map((item) => {
        if (item.tipo !== 'quiz') return item
        const quiz = quizzes.find((candidato) => candidato.id === item.refId)
        return quiz ? { ...item, titulo: quiz.titulo } : item
      })
      const salvo = await salvarTrilha(
        { titulo, descricao, notaMinima, publicado, itens: itensAtuais, quizzes, ...audiencia },
        usuarios,
        nova ? undefined : id,
      )
      await portal.atualizar()
      navigate(`/admin/trilhas/${salvo}`)
    } catch (falha) {
      setErro(mensagemErro(falha))
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Link to="/admin/trilhas" className="text-sm text-ink/50">Trilhas</Link>
      <h1 className="text-3xl font-extrabold">{nova ? 'Nova trilha' : 'Editar trilha'}</h1>
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      <Campo label="Título">
        <input className={inputClass} value={titulo} maxLength={120} onChange={(e) => setTitulo(e.target.value)} />
      </Campo>
      <Campo label="Descrição">
        <textarea className={inputClass} rows={3} value={descricao} onChange={(e) => setDescricao(e.target.value)} />
      </Campo>
      <Campo label="Nota mínima do quiz (%)">
        <input className={inputClass} type="number" min={0} max={100} value={notaMinima} onChange={(e) => setNotaMinima(Number(e.target.value))} />
      </Campo>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={publicado} onChange={(e) => setPublicado(e.target.checked)} />
        Publicada
      </label>
      <AudienciaFields valor={audiencia} usuarios={usuarios} onChange={setAudiencia} />
      <section className="space-y-3">
        <h2 className="font-bold">Etapas</h2>
        <ol className="space-y-2">
          {itens.map((item, indice) => (
            <li key={item.id} className="flex items-center justify-between rounded-xl border border-line bg-white px-3 py-2 text-sm">
              <span>{indice + 1}. {item.titulo} · {item.tipo}</span>
              <span className="flex gap-2">
                <button type="button" onClick={() => indice > 0 && setItens(itens.map((atual, posicao) => (posicao === indice ? itens[indice - 1] : posicao === indice - 1 ? item : atual)))}>Subir</button>
                <button type="button" className="text-red-700" onClick={() => setItens(itens.filter((atual) => atual.id !== item.id))}>Remover</button>
              </span>
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          <select className={inputClass} value={docId} onChange={(e) => setDocId(e.target.value)}>
            <option value="">Documento…</option>
            {portal.documentos.map((documento) => (
              <option key={documento.id} value={documento.id}>{documento.titulo}</option>
            ))}
          </select>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              const documento = portal.documentos.find((item) => item.id === docId)
              if (!documento) return
              setItens([...itens, { id: crypto.randomUUID(), tipo: 'documento', refId: documento.id, titulo: documento.titulo }])
            }}
          >
            Adicionar documento
          </Button>
          <Button type="button" variant="secondary" onClick={adicionarQuiz}>Adicionar quiz</Button>
        </div>
      </section>
      {quizzes.map((quiz) => (
        <section key={quiz.id} className="space-y-3 rounded-2xl border border-line bg-white p-4">
          <Campo label="Quiz">
            <input
              className={inputClass}
              value={quiz.titulo}
              onChange={(e) => setQuizzes(quizzes.map((item) => (item.id === quiz.id ? { ...item, titulo: e.target.value } : item)))}
            />
          </Campo>
          {quiz.perguntas.map((pergunta, indice) => (
            <div key={pergunta.id} className="space-y-2 rounded-xl bg-paper p-3">
              <input
                className={inputClass}
                placeholder="Enunciado"
                value={pergunta.enunciado}
                onChange={(e) => atualizarPergunta(quiz.id, indice, { ...pergunta, enunciado: e.target.value })}
              />
              {pergunta.opcoes.map((opcao, opcaoIndice) => (
                <label key={opcaoIndice} className="flex items-center gap-2">
                  <input type="radio" checked={pergunta.correta === opcaoIndice} onChange={() => atualizarPergunta(quiz.id, indice, { ...pergunta, correta: opcaoIndice })} />
                  <input
                    className={inputClass}
                    value={opcao}
                    onChange={(e) => {
                      const opcoes = pergunta.opcoes.map((atual, posicao) => (posicao === opcaoIndice ? e.target.value : atual))
                      atualizarPergunta(quiz.id, indice, { ...pergunta, opcoes })
                    }}
                  />
                </label>
              ))}
              <button type="button" className="text-xs font-semibold" onClick={() => atualizarPergunta(quiz.id, indice, { ...pergunta, opcoes: [...pergunta.opcoes, ''] })}>
                Mais uma alternativa
              </button>
            </div>
          ))}
          <Button type="button" variant="secondary" onClick={() => setQuizzes(quizzes.map((item) => (item.id === quiz.id ? { ...item, perguntas: [...item.perguntas, novaPergunta()] } : item)))}>
            Nova pergunta
          </Button>
        </section>
      ))}
      <div className="flex gap-2">
        <Button onClick={() => void salvar()}>Salvar trilha</Button>
        {!nova && id ? (
          <Button
            variant="danger"
            onClick={() => {
              if (!window.confirm('Excluir a trilha e os quizzes dela?')) return
              void excluirTrilha(id).then(() => navigate('/admin/trilhas')).catch((falha: unknown) => setErro(mensagemErro(falha)))
            }}
          >
            Excluir
          </Button>
        ) : null}
      </div>
    </div>
  )

  function atualizarPergunta(quizId: string, indice: number, pergunta: Pergunta) {
    setQuizzes((atual) =>
      atual.map((quiz) =>
        quiz.id === quizId ? { ...quiz, perguntas: quiz.perguntas.map((item, posicao) => (posicao === indice ? pergunta : item)) } : quiz,
      ),
    )
  }
}
