import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { Aviso, Button } from '../components/ui'
import { obterQuiz, registrarTentativa } from '../lib/api'
import { useAuth } from '../lib/auth'
import { mensagemErro } from '../lib/errors'
import { usePortal } from '../lib/portal'
import { corrigirQuiz } from '../lib/quiz'
import type { Quiz } from '../types'

export function QuizPage() {
  const { trilhaId = '', quizId = '' } = useParams()
  const { user } = useAuth()
  const portal = usePortal()
  const [quiz, setQuiz] = useState<Quiz | null>(null)
  const [erro, setErro] = useState('')
  const [respostas, setRespostas] = useState<number[]>([])
  const [resultado, setResultado] = useState<{ nota: number; aprovado: boolean; acertos: number } | null>(null)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    void obterQuiz(quizId)
      .then((item) => {
        setQuiz(item)
        setRespostas(item ? item.perguntas.map(() => -1) : [])
      })
      .catch((falha: unknown) => setErro(mensagemErro(falha)))
  }, [quizId])

  if (erro) return <Aviso tom="erro">{erro}</Aviso>
  if (!quiz || !user) return <p>Carregando quiz…</p>

  async function enviar() {
    if (!quiz || !user) return
    if (respostas.some((resposta) => resposta < 0)) {
      setErro('Responda todas as perguntas.')
      return
    }
    const correcao = corrigirQuiz(quiz.perguntas, respostas, quiz.notaMinima)
    setOcupado(true)
    setErro('')
    try {
      await registrarTentativa({
        uid: user.uid,
        quizId: quiz.id,
        trilhaId,
        nota: correcao.nota,
        aprovado: correcao.aprovado,
        respostas,
      })
      setResultado(correcao)
      await portal.atualizar()
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setOcupado(false)
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <Link to={`/trilhas/${trilhaId}`} className="text-sm text-ink/50">
        Voltar à trilha
      </Link>
      <h1 className="text-3xl font-extrabold">{quiz.titulo}</h1>
      <p className="text-sm text-ink/60">Nota mínima {quiz.notaMinima}. A correção acontece neste navegador e a tentativa fica gravada para a franqueadora.</p>
      {resultado ? (
        <Aviso tom={resultado.aprovado ? 'ok' : 'erro'}>
          {resultado.acertos} de {quiz.perguntas.length} · nota {resultado.nota}.{' '}
          {resultado.aprovado ? 'Você atingiu a nota mínima.' : 'Você pode tentar de novo.'}
        </Aviso>
      ) : null}
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      <ol className="space-y-4">
        {quiz.perguntas.map((pergunta, indice) => (
          <li key={pergunta.id} className="rounded-2xl border border-line bg-white p-4">
            <p className="font-semibold">
              {indice + 1}. {pergunta.enunciado}
            </p>
            <div className="mt-3 space-y-2">
              {pergunta.opcoes.map((opcao, opcaoIndice) => {
                const marcada = respostas[indice] === opcaoIndice
                const revelar = Boolean(resultado)
                const certa = revelar && opcaoIndice === pergunta.correta
                return (
                  <label key={opcao} className={`flex cursor-pointer gap-2 rounded-xl border px-3 py-2 text-sm ${certa ? 'border-lime bg-lime/10' : marcada ? 'border-brand' : 'border-line'}`}>
                    <input
                      type="radio"
                      name={pergunta.id}
                      disabled={Boolean(resultado)}
                      checked={marcada}
                      onChange={() => setRespostas((atual) => atual.map((valor, posicao) => (posicao === indice ? opcaoIndice : valor)))}
                    />
                    {opcao}
                  </label>
                )
              })}
            </div>
          </li>
        ))}
      </ol>
      {resultado ? (
        <Link to={`/trilhas/${trilhaId}`} className="inline-flex rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white">
          Voltar à trilha
        </Link>
      ) : (
        <Button onClick={() => void enviar()} disabled={ocupado}>
          Enviar respostas
        </Button>
      )}
    </div>
  )
}
