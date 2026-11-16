import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { getDocs, collection, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { modulosDaMigracao, slugsFranqueadoDaFonte } from '../src/lib/migrarModulos.ts'

async function main() {
  const { entrarComoAdmin } = await import('./firebase-client.mjs')
  const { db } = await entrarComoAdmin()
  const catalogo = slugsFranqueadoDaFonte(readFileSync(new URL('../src/data/modulos.ts', import.meta.url), 'utf8'))
  if (!catalogo.length) throw new Error('Catálogo de módulos do franqueado vazio.')
  const snap = await getDocs(collection(db, 'usuarios'))
  const alvos = snap.docs.flatMap((item) => {
    const modulos = modulosDaMigracao(item.data(), catalogo)
    return modulos ? [{ id: item.id, email: item.data().email, modulos }] : []
  })
  if (!alvos.length) {
    console.log('Nenhum franqueado ativo sem modulosLiberados.')
    return
  }
  for (const alvo of alvos) {
    await updateDoc(doc(db, 'usuarios', alvo.id), {
      modulosLiberados: alvo.modulos,
      atualizadoEm: serverTimestamp(),
    })
    console.log(`Migrado: ${alvo.email || alvo.id}`)
  }
  console.log(`${alvos.length} franqueado(s) ativo(s) receberam o catálogo atual.`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erro) => {
    console.error(erro instanceof Error ? erro.message : erro)
    process.exit(1)
  })
}
