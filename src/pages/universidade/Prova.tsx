import { useEffect, useState, type FormEvent } from 'react'
import { Link, useLocation, useParams } from 'react-router-dom'
import { Aviso, Button, Carregando } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { MAX_TENTATIVAS, mensagemResultado } from '../../lib/universidade'
import { enviarTentativa } from '../../lib/universidadeApi'
import { useVisao } from '../../lib/visao'
import { seloDoCurso } from './Universidade'
import { useUniversidade } from './useUniversidade'

export function ProvaPage() {
  const { cursoId = '' } = useParams()
  const { user } = useAuth()
  const { comoFranqueado } = useVisao()
  const dados = useUniversidade()
  const curso = dados.cursos.find((c) => c.id === cursoId)
  const prova = dados.provas.get(cursoId)
  const [respostas, setRespostas] = useState<Record<string, number>>({})
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const [resultado, setResultado] = useState<{ aprovado: boolean; restantes: number } | null>(null)
  const { key } = useLocation()

  // Abrir a prova de novo (mesma rota) começa uma folha em branco.
  useEffect(() => {
    setResultado(null)
    setRespostas({})
    setErro('')
  }, [key, cursoId])

  if (!user) return null
  if (dados.carregando && !resultado) return <Carregando texto="Abrindo a prova…" />
  const voltar = (
    <Link to={`/universidade/curso/${cursoId}`} className="text-sm font-semibold text-brand-dark">
      Voltar para o curso
    </Link>
  )
  if (!curso || !prova) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Aviso tom="erro">Prova indisponível.</Aviso>
        {voltar}
      </div>
    )
  }

  if (resultado) {
    return (
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-extrabold">{prova.titulo}</h1>
        <Aviso tom={resultado.aprovado ? 'ok' : 'erro'}>{mensagemResultado(resultado.aprovado, resultado.restantes)}</Aviso>
        <p className="text-sm text-ink/60">Por segurança, a prova não mostra quais respostas estavam certas.</p>
        {voltar}
      </div>
    )
  }

  const selo = seloDoCurso(curso, dados)
  const estado = selo.estado
  const aulasCompletas = selo.feitas >= curso.aulas.length
  if (!dados.participa || comoFranqueado) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Aviso>Pré-visualização: só as unidades fazem a prova.</Aviso>
        {voltar}
      </div>
    )
  }
  if (estado?.tipo !== 'disponivel' || !aulasCompletas) {
    return (
      <div className="mx-auto max-w-3xl space-y-3">
        <Aviso>
          {estado?.tipo === 'aprovado'
            ? 'Você já foi aprovado neste curso.'
            : estado?.tipo === 'reestudo'
              ? 'Você usou as 3 chances. Conclua o reestudo do manual para liberar novas tentativas.'
              : 'A prova ainda não está liberada para você. Conclua as aulas do curso primeiro.'}
        </Aviso>
        {voltar}
      </div>
    )
  }

  const faltando = prova.perguntas.filter((p) => respostas[p.id] === undefined).length

  async function enviar(evento: FormEvent) {
    evento.preventDefault()
    if (!user || !prova || estado?.tipo !== 'disponivel' || faltando) return
    if (!window.confirm(`Enviar a prova? Esta é a tentativa ${estado.numero} de ${MAX_TENTATIVAS} e não pode ser desfeita.`)) return
    setEnviando(true)
    setErro('')
    try {
      const lista = prova.perguntas.map((p) => respostas[p.id])
      const { aprovado } = await enviarTentativa(user, prova, estado.ciclo, estado.numero, lista)
      setResultado({ aprovado, restantes: aprovado ? 0 : MAX_TENTATIVAS - estado.numero })
      dados.recarregar()
    } catch (falha) {
      setErro(mensagemErro(falha))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <form onSubmit={(e) => void enviar(e)} className="mx-auto max-w-3xl space-y-5">
      <p className="text-sm text-ink/50">
        <Link to="/universidade">Universidade UBOX</Link> / <Link to={`/universidade/curso/${curso.id}`}>{curso.titulo}</Link>
      </p>
      <div>
        <h1 className="text-3xl font-extrabold">{prova.titulo}</h1>
        <p className="mt-1 text-sm text-ink/60">
          Tentativa {estado.numero} de {MAX_TENTATIVAS}
          {estado.ciclo > 1 ? ` · ciclo ${estado.ciclo}` : ''} · nota mínima {prova.notaMinima}%. A correção é feita pelo servidor.
        </p>
      </div>
      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      <ol className="space-y-4">
        {prova.perguntas.map((pergunta, indice) => (
          <li key={pergunta.id} className="rounded-2xl border border-line bg-white p-5">
            <fieldset>
              <legend className="font-semibold">
                {indice + 1}. {pergunta.enunciado}
              </legend>
              <div className="mt-3 space-y-2">
                {pergunta.opcoes.map((opcao, i) => (
                  <label key={i} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line px-3 py-2 text-sm hover:border-brand has-[:checked]:border-brand has-[:checked]:bg-brand/5">
                    <input
                      type="radio"
                      name={pergunta.id}
                      className="mt-0.5"
                      checked={respostas[pergunta.id] === i}
                      onChange={() => setRespostas((atual) => ({ ...atual, [pergunta.id]: i }))}
                    />
                    <span>{opcao}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={enviando || faltando > 0}>
          {enviando ? 'Enviando…' : 'Enviar respostas'}
        </Button>
        {faltando ? <span className="text-sm text-ink/55">Falta{faltando === 1 ? '' : 'm'} {faltando} pergunta{faltando === 1 ? '' : 's'}.</span> : null}
      </div>
    </form>
  )
}
