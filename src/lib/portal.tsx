import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Aviso, Categoria, Certificado, Documento, Leitura, Aceite, Tentativa, Trilha } from '../types'
import { carregarAvisos, carregarMeuProgresso, carregarPortal, marcarAvisoLido } from './api'
import { useAuth } from './auth'
import { documentoVisivelAoFranqueado, trilhaVisivelAoFranqueado, useVisao } from './visao'
import { mensagemErro } from './errors'
import { paraMillis } from './format'

interface PortalValue {
  categorias: Categoria[]
  documentos: Documento[]
  trilhas: Trilha[]
  leituras: Leitura[]
  aceites: Aceite[]
  tentativas: Tentativa[]
  certificados: Certificado[]
  avisos: Aviso[]
  avisosLidos: string[]
  carregando: boolean
  erro: string
  atualizar: () => Promise<void>
  marcarLido: (avisoId: string) => Promise<void>
}

const PortalContext = createContext<PortalValue | null>(null)

export function PortalProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const { comoFranqueado, simulado } = useVisao()
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [documentos, setDocumentos] = useState<Documento[]>([])
  const [trilhas, setTrilhas] = useState<Trilha[]>([])
  const [leituras, setLeituras] = useState<Leitura[]>([])
  const [aceites, setAceites] = useState<Aceite[]>([])
  const [tentativas, setTentativas] = useState<Tentativa[]>([])
  const [certificados, setCertificados] = useState<Certificado[]>([])
  const [avisos, setAvisos] = useState<Aviso[]>([])
  const [avisosLidos, setAvisosLidos] = useState<string[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!user) return
    let ativo = true
    setCarregando(true)
    void Promise.all([carregarPortal(user), carregarMeuProgresso(user.uid), carregarAvisos(user)])
      .then(([portal, progresso, listaAvisos]) => {
        if (!ativo) return
        setCategorias(portal.categorias)
        setDocumentos(portal.documentos)
        setTrilhas(portal.trilhas)
        setLeituras(progresso.leituras)
        setAceites(progresso.aceites)
        setTentativas(progresso.tentativas)
        setCertificados(progresso.certificados)
        setAvisosLidos(progresso.avisosLidos.map((item) => item.avisoId))
        setAvisos(listaAvisos.sort((a, b) => paraMillis(b.criadoEm) - paraMillis(a.criadoEm)))
        setErro('')
      })
      .catch((falha: unknown) => {
        if (ativo) setErro(mensagemErro(falha))
      })
      .finally(() => {
        if (ativo) setCarregando(false)
      })
    return () => {
      ativo = false
    }
  }, [user, tick])

  const documentosVisiveis = useMemo(
    () => (comoFranqueado && simulado ? documentos.filter((documento) => documentoVisivelAoFranqueado(documento, simulado)) : comoFranqueado ? [] : documentos),
    [comoFranqueado, documentos, simulado],
  )
  const trilhasVisiveis = useMemo(
    () => (comoFranqueado && simulado ? trilhas.filter((trilha) => trilhaVisivelAoFranqueado(trilha, simulado)) : comoFranqueado ? [] : trilhas),
    [comoFranqueado, trilhas, simulado],
  )
  const categoriasVisiveis = useMemo(
    () =>
      comoFranqueado && simulado
        ? categorias.filter((categoria) => categoria.publico || categoria.uids.includes(simulado.uid))
        : comoFranqueado
          ? []
          : categorias,
    [comoFranqueado, categorias, simulado],
  )

  const valor = useMemo<PortalValue>(
    () => ({
      categorias: categoriasVisiveis,
      documentos: documentosVisiveis,
      trilhas: trilhasVisiveis,
      leituras,
      aceites,
      tentativas,
      certificados,
      avisos,
      avisosLidos,
      carregando,
      erro,
      atualizar: async () => setTick((atual) => atual + 1),
      marcarLido: async (avisoId: string) => {
        if (!user) return
        await marcarAvisoLido(user.uid, avisoId)
        setAvisosLidos((atual) => (atual.includes(avisoId) ? atual : [...atual, avisoId]))
      },
    }),
    [categoriasVisiveis, documentosVisiveis, trilhasVisiveis, leituras, aceites, tentativas, certificados, avisos, avisosLidos, carregando, erro, user],
  )

  return <PortalContext.Provider value={valor}>{children}</PortalContext.Provider>
}

export function usePortal(): PortalValue {
  const valor = useContext(PortalContext)
  if (!valor) throw new Error('usePortal fora do provedor')
  return valor
}
