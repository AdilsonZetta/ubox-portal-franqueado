import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Award, GraduationCap, RotateCcw } from 'lucide-react'
import { Aviso, Carregando, Selo, Vazio } from '../../components/ui'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { usePortal } from '../../lib/portal'
import {
  aulasConcluidas,
  estadoDaProva,
  MAX_TENTATIVAS,
  resumirResultados,
  type Curso,
  type EstadoProva,
  type TentativaProva,
} from '../../lib/universidade'
import { listarResultados } from '../../lib/universidadeApi'
import { useVisao } from '../../lib/visao'
import { useUniversidade, type DadosUniversidade } from './useUniversidade'

type Tom = 'neutro' | 'marca' | 'lima' | 'alerta'

export function seloDoCurso(curso: Curso, dados: DadosUniversidade): { rotulo: string; tom: Tom; estado: EstadoProva | null; feitas: number } {
  const feitas = aulasConcluidas(curso, dados.progressos)
  const prova = dados.provas.get(curso.id)
  const estado = prova ? estadoDaProva(curso.id, dados.tentativas, dados.reestudos) : null
  if (!curso.publicado) return { rotulo: 'Rascunho', tom: 'alerta', estado, feitas }
  if (estado?.tipo === 'aprovado') return { rotulo: 'Aprovado', tom: 'lima', estado, feitas }
  if (estado?.tipo === 'reestudo') return { rotulo: 'Reestudo pendente', tom: 'alerta', estado, feitas }
  if (estado?.tipo === 'corrigindo') return { rotulo: 'Corrigindo', tom: 'alerta', estado, feitas }
  if (feitas >= curso.aulas.length && prova) return { rotulo: 'Prova liberada', tom: 'marca', estado, feitas }
  if (feitas > 0) return { rotulo: 'Em andamento', tom: 'alerta', estado, feitas }
  return { rotulo: 'Publicado', tom: 'lima', estado, feitas }
}

export function UniversidadePage() {
  const dados = useUniversidade()
  const { user } = useAuth()
  const { comoFranqueado, simulado } = useVisao()
  const { certificados } = usePortal()
  const { cursos, carregando, erro, gestor, participa, pessoa } = dados
  const [equipe, setEquipe] = useState<TentativaProva[]>([])
  const [erroEquipe, setErroEquipe] = useState('')
  const veEquipe = !comoFranqueado && user?.papel === 'franqueado'

  useEffect(() => {
    if (!user || !veEquipe) return
    let ativo = true
    listarResultados(user, false)
      .then((lista) => ativo && setEquipe(lista))
      .catch((falha) => ativo && setErroEquipe(mensagemErro(falha)))
    return () => {
      ativo = false
    }
  }, [user, veEquipe])

  const resumoEquipe = useMemo(() => resumirResultados(equipe, null), [equipe])
  const titulos = new Map(cursos.map((c) => [c.id, c.titulo]))
  const aprovados = cursos.filter((c) => seloDoCurso(c, dados).estado?.tipo === 'aprovado').length

  if (!user) return null
  if (comoFranqueado && !simulado) return <Aviso>Escolha qual franqueado simular para ver a Universidade dessa pessoa.</Aviso>

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink/40">Universidade UBOX</p>
          <h1 className="text-3xl font-extrabold">Cursos e provas</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink/65">
            Cada curso reúne aulas da trilha de manuais e termina numa prova. Você tem {MAX_TENTATIVAS} chances por ciclo; se não atingir a nota mínima,
            volta ao manual indicado e, depois de concluí-lo, ganha novas chances. A correção é feita pelo servidor.
          </p>
        </div>
        {gestor ? (
          <Link to="/universidade/gestao" className="inline-flex items-center justify-center rounded-xl border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink hover:border-ink/30">
            Gestão da Universidade
          </Link>
        ) : null}
      </header>

      {erro ? <Aviso tom="erro">{erro}</Aviso> : null}
      {comoFranqueado ? <Aviso>Simulação: você vê a Universidade como {simulado?.nome}. Nada é gravado em nome dessa pessoa.</Aviso> : null}
      {!participa && !comoFranqueado ? <Aviso>Os cursos são feitos pelas unidades. Aqui você vê como eles aparecem; os resultados ficam na Gestão.</Aviso> : null}
      {carregando ? <Carregando texto="Carregando cursos…" /> : null}
      {!carregando && !cursos.length ? <Vazio titulo="Nenhum curso publicado" texto="A franqueadora monta os cursos da formação aqui." /> : null}

      {participa && cursos.length ? (
        <section className="grid gap-3 sm:grid-cols-3" aria-label="Resumo da Universidade">
          <article className="rounded-2xl border border-line bg-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-ink/40">Cursos aprovados</p>
            <p className="mt-1.5 text-3xl font-black text-ink">
              {aprovados}
              <span className="text-lg font-bold text-ink/35"> / {cursos.length}</span>
            </p>
          </article>
          <article className="rounded-2xl border border-line bg-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-ink/40">Certificados</p>
            <p className="mt-1.5 text-3xl font-black text-ink">{certificados.filter((c) => c.uid === pessoa?.uid && titulos.has(c.trilhaId)).length}</p>
            <Link to="/meus-certificados" className="mt-1 inline-block text-xs font-semibold text-brand-dark hover:underline">Ver meus certificados</Link>
          </article>
          <article className="rounded-2xl border border-line bg-white p-4 shadow-sm">
            <p className="text-xs font-bold uppercase tracking-wider text-ink/40">Nota mínima</p>
            <p className="mt-1.5 text-sm text-ink/65">Definida pela franqueadora em cada prova. A resposta certa nunca é mostrada.</p>
          </article>
        </section>
      ) : null}

      <ul className="grid gap-3 md:grid-cols-2">
        {cursos.map((curso) => {
          const selo = seloDoCurso(curso, dados)
          const prova = dados.provas.get(curso.id)
          const percentual = curso.aulas.length ? Math.round((selo.feitas / curso.aulas.length) * 100) : 100
          return (
            <li key={curso.id}>
              <Link to={`/universidade/curso/${curso.id}`} className="block h-full rounded-2xl border border-line bg-white p-5 hover:border-brand">
                <div className="flex flex-wrap gap-2">
                  <Selo tom={selo.tom}>{selo.rotulo}</Selo>
                  {selo.estado?.tipo === 'disponivel' && selo.estado.restantes < MAX_TENTATIVAS ? <Selo>{selo.estado.restantes} chance{selo.estado.restantes === 1 ? '' : 's'}</Selo> : null}
                </div>
                <h2 className="mt-2 text-lg font-bold">{curso.titulo}</h2>
                <p className="mt-1 line-clamp-3 text-sm text-ink/65">{curso.descricao}</p>
                {participa ? (
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuenow={percentual} aria-valuemin={0} aria-valuemax={100} aria-label={`Aulas concluídas em ${curso.titulo}`}>
                    <div className="h-full rounded-full bg-lime" style={{ width: `${percentual}%` }} />
                  </div>
                ) : null}
                <p className="mt-3 text-xs text-ink/45">
                  {curso.aulas.length} aula{curso.aulas.length === 1 ? '' : 's'}
                  {participa ? ` · ${selo.feitas} concluída${selo.feitas === 1 ? '' : 's'}` : ''}
                  {prova ? ` · prova com mínimo de ${prova.notaMinima}%` : ' · prova ainda não publicada'}
                </p>
              </Link>
            </li>
          )
        })}
      </ul>

      {veEquipe ? (
        <section className="overflow-hidden rounded-3xl border border-line bg-white shadow-sm">
          <h2 className="flex items-center gap-2 border-b border-line bg-paper/60 px-5 py-3 text-sm font-bold uppercase tracking-wider text-ink/55">
            <GraduationCap className="h-4 w-4" aria-hidden="true" /> Resultados da minha equipe
          </h2>
          {erroEquipe ? <div className="p-4"><Aviso tom="erro">{erroEquipe}</Aviso></div> : null}
          {!resumoEquipe.length ? <p className="px-5 py-4 text-sm text-ink/55">Ninguém da unidade fez prova ainda.</p> : null}
          {resumoEquipe.flatMap((u) => u.pessoas).map((p) => (
            <div key={p.uid} className="border-b border-line px-5 py-3 last:border-0">
              <p className="font-semibold">{p.nome}</p>
              <ul className="mt-1 flex flex-wrap gap-2">
                {p.cursos.map((c) => (
                  <li key={c.cursoId} className="flex items-center gap-1.5 rounded-full border border-line px-2.5 py-1 text-xs">
                    {c.aprovado ? <Award className="h-3.5 w-3.5 text-lime-dark" aria-hidden="true" /> : c.aguardandoReestudo ? <RotateCcw className="h-3.5 w-3.5 text-ink/50" aria-hidden="true" /> : null}
                    <span>{titulos.get(c.cursoId) ?? c.cursoId}</span>
                    <span className="text-ink/45">· {c.aprovado ? 'aprovado' : c.aguardandoReestudo ? 'em reestudo' : 'reprovado'} · {c.tentativas} tentativa{c.tentativas === 1 ? '' : 's'}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  )
}

/** Cartão da home: andamento da pessoa na Universidade. */
export function CartaoUniversidade() {
  const dados = useUniversidade()
  if (!dados.participa || dados.carregando || !dados.cursos.length) return null
  const proximo = dados.cursos.find((c) => seloDoCurso(c, dados).estado?.tipo !== 'aprovado')
  const aprovados = dados.cursos.filter((c) => seloDoCurso(c, dados).estado?.tipo === 'aprovado').length
  const percentual = Math.round((aprovados / dados.cursos.length) * 100)
  return (
    <Link
      to={proximo ? `/universidade/curso/${proximo.id}` : '/universidade'}
      className="flex items-center gap-4 rounded-2xl border border-line bg-white px-5 py-4 shadow-sm transition hover:border-brand"
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand/10 text-brand-dark" aria-hidden="true">
        <GraduationCap className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-ink">Universidade UBOX · {aprovados} de {dados.cursos.length} cursos</span>
        <span className="block text-sm text-ink/60">{proximo ? `Próximo: ${proximo.titulo} (${seloDoCurso(proximo, dados).rotulo.toLowerCase()})` : 'Todos os cursos aprovados. Parabéns!'}</span>
        <span className="mt-2 block h-1.5 overflow-hidden rounded-full bg-paper" role="progressbar" aria-valuenow={percentual} aria-valuemin={0} aria-valuemax={100} aria-label="Cursos aprovados">
          <span className="block h-full rounded-full bg-lime" style={{ width: `${percentual}%` }} />
        </span>
      </span>
      <span className="text-sm font-semibold text-brand">Abrir</span>
    </Link>
  )
}
