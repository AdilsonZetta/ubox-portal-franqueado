import { collection, doc, getDocs, query, runTransaction, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore'
import { SLUGS_FRANQUEADO, subconjunto } from '../data/modulos'
import type { Papel, Unidade, Usuario } from '../types'
import { mapUsuario } from './api'
import { criarLoginEGravar, senhaProvisoria } from './criarConta'
import { requireDb } from './firebase'

export interface NovaConta {
  nome: string
  email: string
  senha: string
  papel: Exclude<Papel, 'admin'>
  unidade: string
  cidade: string
  unidadeId: string | null
  modulosLiberados: string[]
  ativo: boolean
  criadoPor: string
}

export function dadosPerfil(uid: string, conta: NovaConta) {
  return {
    uid,
    email: conta.email.trim(),
    nome: conta.nome.trim(),
    papel: conta.papel,
    ativo: conta.ativo,
    recusado: false,
    unidade: conta.unidade.trim(),
    cidade: conta.cidade.trim(),
    unidadeId: conta.unidadeId,
    modulosLiberados: conta.modulosLiberados,
    criadoPor: conta.criadoPor,
    criadoEm: serverTimestamp(),
    atualizadoEm: serverTimestamp(),
  }
}

export async function criarPerfil(uid: string, conta: NovaConta): Promise<void> {
  await setDoc(doc(requireDb(), 'usuarios', uid), dadosPerfil(uid, conta))
}

export async function criarUnidade(dados: {
  nome: string
  cidade: string
  responsavel: string
  email: string
  modulosLiberados: string[]
  criadoPor: string
}): Promise<{ id: string; senha: string; uid: string }> {
  const senha = senhaProvisoria()
  const modulos = dados.modulosLiberados.filter((slug) => SLUGS_FRANQUEADO.includes(slug))
  const id = `un-${crypto.randomUUID().slice(0, 8)}`
  const banco = requireDb()
  const uid = await criarLoginEGravar(dados.email, senha, async (novoUid) => {
    await runTransaction(banco, async (tx) => {
      tx.set(doc(banco, 'unidades', id), {
        nome: dados.nome.trim(),
        cidade: dados.cidade.trim(),
        responsavel: dados.responsavel.trim(),
        email: dados.email.trim(),
        uid: novoUid,
        modulosLiberados: modulos,
        ativo: true,
        criadoPor: dados.criadoPor,
        criadoEm: serverTimestamp(),
        atualizadoEm: serverTimestamp(),
      })
      tx.set(doc(banco, 'usuarios', novoUid), dadosPerfil(novoUid, {
        nome: dados.responsavel,
        email: dados.email,
        senha,
        papel: 'franqueado',
        unidade: dados.nome,
        cidade: dados.cidade,
        unidadeId: id,
        modulosLiberados: modulos,
        ativo: true,
        criadoPor: dados.criadoPor,
      }))
    })
    return novoUid
  })
  return { id, senha, uid }
}

export async function atualizarUnidade(
  unidade: Unidade,
  patch: { nome: string; cidade: string; responsavel: string; modulosLiberados: string[]; ativo: boolean },
): Promise<void> {
  const banco = requireDb()
  const modulos = patch.modulosLiberados.filter((slug) => SLUGS_FRANQUEADO.includes(slug))
  await updateDoc(doc(banco, 'unidades', unidade.id), {
    nome: patch.nome.trim(),
    cidade: patch.cidade.trim(),
    responsavel: patch.responsavel.trim(),
    modulosLiberados: modulos,
    ativo: patch.ativo,
    atualizadoEm: serverTimestamp(),
  })
  if (unidade.uid) {
    await updateDoc(doc(banco, 'usuarios', unidade.uid), {
      nome: patch.responsavel.trim(),
      unidade: patch.nome.trim(),
      cidade: patch.cidade.trim(),
      modulosLiberados: modulos,
      ativo: patch.ativo,
      atualizadoEm: serverTimestamp(),
    })
  }
  const equipe = await getDocs(
    query(collection(banco, 'usuarios'), where('unidadeId', '==', unidade.id), where('papel', '==', 'equipe_franqueado')),
  )
  await Promise.all(
    equipe.docs.map((item) => {
      const atuais = Array.isArray(item.data().modulosLiberados) ? (item.data().modulosLiberados as string[]) : []
      return updateDoc(item.ref, {
        modulosLiberados: atuais.filter((slug) => modulos.includes(slug)),
        unidade: patch.nome.trim(),
        cidade: patch.cidade.trim(),
        atualizadoEm: serverTimestamp(),
      })
    }),
  )
}

export async function listarUnidades(): Promise<Unidade[]> {
  const snap = await getDocs(collection(requireDb(), 'unidades'))
  return snap.docs
    .map((item) => {
      const data = item.data()
      return {
        id: item.id,
        nome: String(data.nome ?? ''),
        cidade: String(data.cidade ?? ''),
        responsavel: String(data.responsavel ?? ''),
        email: String(data.email ?? ''),
        uid: typeof data.uid === 'string' ? data.uid : null,
        modulosLiberados: Array.isArray(data.modulosLiberados) ? data.modulosLiberados.filter((slug) => typeof slug === 'string') : [],
        ativo: data.ativo === true,
        criadoPor: typeof data.criadoPor === 'string' ? data.criadoPor : undefined,
        criadoEm: data.criadoEm,
        atualizadoEm: data.atualizadoEm,
      } satisfies Unidade
    })
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export async function criarUsuarioEquipe(conta: Omit<NovaConta, 'senha'> & { senha?: string }): Promise<string> {
  const senha = conta.senha || senhaProvisoria()
  await criarLoginEGravar(conta.email, senha, (uid) => criarPerfil(uid, { ...conta, senha }))
  return senha
}

export async function listarEquipeDaUnidade(unidadeId: string): Promise<Usuario[]> {
  const snap = await getDocs(
    query(collection(requireDb(), 'usuarios'), where('unidadeId', '==', unidadeId), where('papel', '==', 'equipe_franqueado')),
  )
  return snap.docs.map((item) => mapUsuario(item.id, item.data())).filter((item): item is Usuario => item !== null)
}

export async function atualizarModulosDoUsuario(uid: string, patch: { nome?: string; ativo?: boolean; modulosLiberados?: string[]; teto?: string[] }): Promise<void> {
  const modulos = patch.modulosLiberados && patch.teto && !subconjunto(patch.modulosLiberados, patch.teto)
    ? patch.modulosLiberados.filter((slug) => patch.teto?.includes(slug))
    : patch.modulosLiberados
  await updateDoc(doc(requireDb(), 'usuarios', uid), {
    ...(patch.nome ? { nome: patch.nome.trim() } : {}),
    ...(patch.ativo === undefined ? {} : { ativo: patch.ativo }),
    ...(modulos ? { modulosLiberados: modulos } : {}),
    atualizadoEm: serverTimestamp(),
  })
}
