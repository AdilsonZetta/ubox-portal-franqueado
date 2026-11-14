import { useEffect, useState } from 'react'
import { Aviso, Carregando, Selo } from '../../components/ui'
import { carregarRegistrosAdmin, listarQuizzes, listarUsuarios } from '../../lib/api'
import { formatarData } from '../../lib/format'
import { usePortal } from '../../lib/portal'
import { corrigirQuiz, leituraDaVersao } from '../../lib/quiz'
import type { Aceite, Certificado, Leitura, Quiz, Tentativa, Usuario } from '../../types'

export function ConformidadePage() {
  const portal = usePortal()
  const [usuarios, setUsuarios] = useState<Usuario[]>([])
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [registros, setRegistros] = useState<{ leituras: Leitura[]; aceites: Aceite[]; tentativas: Tentativa[]; certificados: Certificado[] } | null>(null)
  const [erro, setErro] = useState('')
  const [aberto, setAberto] = useState<string | null>(null)

  useEffect(() => {
    void Promise.all([listarUsuarios(), listarQuizzes(), carregarRegistrosAdmin()])
      .then(([lista, qs, regs]) => {
        setUsuarios(lista)
        setQuizzes(qs)
        setRegistros(regs)
      })
      .catch((falha: unknown) => setErro(falha instanceof Error ? falha.message : 'Falha ao carregar o painel.'))
  }, [])

  if (erro) return <Aviso tom="erro">{erro}</Aviso>
  if (!registros) return <Carregando texto="Montando o painel de leituras…" />

  const franqueados = usuarios.filter((usuario) => usuario.papel === 'franqueado')
  const obrigatorios = portal.documentos.filter((documento) => documento.leituraObrigatoria && documento.status === 'publicado')

  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-extrabold">Leituras, aceites e quizzes</h1>
      <p className="text-sm text-ink/60">A nota exibida no quiz é recalculada aqui a partir das respostas gravadas. Se divergir do que o franqueado enviou, o selo “rever” aparece.</p>
      <div className="space-y-3">
        {franqueados.map((usuario) => {
          const aplicaveis = obrigatorios.filter((documento) => documento.publico || documento.uids.includes(usuario.uid))
          const aceitos = aplicaveis.filter((documento) =>
            registros.aceites.some((aceite) => aceite.uid === usuario.uid && aceite.documentoId === documento.id && aceite.versao === documento.versao),
          )
          return (
            <article key={usuario.uid} className="rounded-2xl border border-line bg-white">
              <button className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left" onClick={() => setAberto(aberto === usuario.uid ? null : usuario.uid)}>
                <span>
                  <span className="block font-semibold">{usuario.nome}</span>
                  <span className="text-xs text-ink/50">{usuario.unidade || 'Sem unidade'} · {usuario.email}</span>
                </span>
                <span className="text-sm">{usuario.ativo ? `${aceitos.length}/${aplicaveis.length} aceites` : 'Pendente'}</span>
              </button>
              {aberto === usuario.uid ? (
                <div className="space-y-4 border-t border-line px-4 py-3 text-sm">
                  <div>
                    <p className="font-semibold">Documentos obrigatórios</p>
                    <ul className="mt-2 space-y-1">
                      {aplicaveis.map((documento) => {
                        const aceite = registros.aceites.find((item) => item.uid === usuario.uid && item.documentoId === documento.id && item.versao === documento.versao)
                        const leu = leituraDaVersao(registros.leituras, usuario.uid, documento.id, documento.versao)
                        return (
                          <li key={documento.id} className="flex justify-between gap-3">
                            <span>{documento.titulo}</span>
                            {aceite ? <Selo tom="lima">Aceito {formatarData(aceite.aceitoEm)}</Selo> : leu ? <Selo>Lido</Selo> : <Selo tom="alerta">Pendente</Selo>}
                          </li>
                        )
                      })}
                    </ul>
                  </div>
                  <div>
                    <p className="font-semibold">Quizzes</p>
                    <ul className="mt-2 space-y-1">
                      {registros.tentativas
                        .filter((tentativa) => tentativa.uid === usuario.uid)
                        .map((tentativa) => {
                          const quiz = quizzes.find((item) => item.id === tentativa.quizId)
                          const divergente = quiz ? corrigirQuiz(quiz.perguntas, tentativa.respostas, quiz.notaMinima).nota !== tentativa.nota : false
                          return (
                            <li key={tentativa.id} className="flex justify-between gap-3">
                              <span>{quiz?.titulo ?? tentativa.quizId}</span>
                              <span>
                                {tentativa.nota}% {tentativa.aprovado ? 'aprovado' : 'reprovado'}
                                {divergente ? ' · rever' : ''}
                              </span>
                            </li>
                          )
                        })}
                    </ul>
                  </div>
                </div>
              ) : null}
            </article>
          )
        })}
      </div>
    </div>
  )
}
