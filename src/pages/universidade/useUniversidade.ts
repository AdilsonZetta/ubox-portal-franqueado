import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../../lib/auth'
import { mensagemErro } from '../../lib/errors'
import { listarMeuProgresso, listarTrilhaManuais } from '../../lib/manuaisApi'
import type { ItemTrilhaManual, ProgressoManual } from '../../lib/manuaisTrilha'
import { fazUniversidade, ordenarCursos, podeGerirUniversidade, type Curso, type Prova, type Reestudo, type TentativaProva } from '../../lib/universidade'
import { listarCursos, listarMeusReestudos, listarMinhasTentativas, obterProva } from '../../lib/universidadeApi'
import { useVisao } from '../../lib/visao'
import type { Usuario } from '../../types'

export interface DadosUniversidade {
  pessoa: Usuario | null
  gestor: boolean
  participa: boolean
  cursos: Curso[]
  provas: Map<string, Prova>
  trilha: ItemTrilhaManual[]
  progressos: ProgressoManual[]
  tentativas: TentativaProva[]
  reestudos: Reestudo[]
  carregando: boolean
  erro: string
  recarregar: () => void
}

/** Carrega cursos, provas (sem respostas) e o andamento da pessoa (ou da simulada). */
export function useUniversidade(): DadosUniversidade {
  const { user } = useAuth()
  const { ehAdmin, comoFranqueado, simulado } = useVisao()
  const pessoa = comoFranqueado ? simulado : user
  const gestor = podeGerirUniversidade(user, ehAdmin) && !comoFranqueado
  const participa = fazUniversidade(pessoa)
  const [cursos, setCursos] = useState<Curso[]>([])
  const [provas, setProvas] = useState<Map<string, Prova>>(new Map())
  const [trilha, setTrilha] = useState<ItemTrilhaManual[]>([])
  const [progressos, setProgressos] = useState<ProgressoManual[]>([])
  const [tentativas, setTentativas] = useState<TentativaProva[]>([])
  const [reestudos, setReestudos] = useState<Reestudo[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [tique, setTique] = useState(0)
  const recarregar = useCallback(() => setTique((t) => t + 1), [])
  const uid = pessoa?.uid ?? ''

  useEffect(() => {
    if (!user || !uid) {
      setCarregando(false)
      return
    }
    let ativo = true
    setCarregando(true)
    setErro('')
    const seguro = <T,>(promessa: Promise<T>, padrao: T) => promessa.catch(() => padrao)
    void (async () => {
      try {
        const lista = ordenarCursos(await listarCursos(gestor || (ehAdmin && !comoFranqueado)))
        const visiveis = comoFranqueado ? lista.filter((c) => c.publicado) : lista
        const [provasLidas, itens, meus, minhas, reest] = await Promise.all([
          Promise.all(visiveis.map((c) => obterProva(c.id))),
          seguro(listarTrilhaManuais(), [] as ItemTrilhaManual[]),
          participa ? seguro(listarMeuProgresso(uid), [] as ProgressoManual[]) : Promise.resolve([] as ProgressoManual[]),
          participa ? listarMinhasTentativas(uid) : Promise.resolve([] as TentativaProva[]),
          participa ? listarMeusReestudos(uid) : Promise.resolve([] as Reestudo[]),
        ])
        if (!ativo) return
        setCursos(visiveis)
        setProvas(new Map(provasLidas.filter((p): p is Prova => Boolean(p)).map((p) => [p.cursoId, p])))
        setTrilha(itens)
        setProgressos(meus)
        setTentativas(minhas)
        setReestudos(reest)
      } catch (falha) {
        if (ativo) setErro(mensagemErro(falha))
      } finally {
        if (ativo) setCarregando(false)
      }
    })()
    return () => {
      ativo = false
    }
  }, [user, uid, gestor, participa, ehAdmin, comoFranqueado, tique])

  return { pessoa, gestor, participa, cursos, provas, trilha, progressos, tentativas, reestudos, carregando, erro, recarregar }
}
