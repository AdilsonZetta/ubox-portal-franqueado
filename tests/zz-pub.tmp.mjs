import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, getDocs, updateDoc } from 'firebase/firestore'
import fs from 'node:fs'
const env = await initializeTestEnvironment({ projectId: 'demo-ubox', firestore: { host: '127.0.0.1', port: 8080, rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') } })
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore(); let n = 0
  for (const s of (await getDocs(collection(db, 'documentos'))).docs) { await updateDoc(s.ref, { status: 'publicado', publicadoEm: new Date() }); n++ }
  for (const c of ['cursos', 'provas']) for (const s of (await getDocs(collection(db, c))).docs) { await updateDoc(s.ref, { publicado: true }); n++ }
  console.log('publicados', n)
})
await env.cleanup()
