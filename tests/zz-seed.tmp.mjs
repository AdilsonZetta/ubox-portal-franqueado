// copiar para tests/ do worktree antes de rodar (usa node_modules do repo)
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
import fs from 'node:fs'
const SENHA = 'senha-teste-123'
const contas = [
  ['admin@example.com', 'Adilson Teste', 'admin', null, []],
  ['rede@example.com', 'Rafaela Rede', 'equipe_franqueadora', null, ['manuais', 'universidade', 'checklist', 'acompanhamento', 'auditoria', 'marketing', 'nuvem-rede']],
  ['carlos@example.com', 'Carlos Mendes', 'franqueado', 'un-a', ['manuais', 'universidade', 'checklist', 'marketing', 'chamados', 'senhas', 'estoque', 'crm', 'nuvem']],
]
const uids = {}
for (const [email, nome] of contas) {
  const r = await fetch('http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: SENHA, displayName: nome, returnSecureToken: true }) })
  const j = await r.json(); if (!j.localId) throw new Error(JSON.stringify(j)); uids[email] = j.localId
}
const env = await initializeTestEnvironment({ projectId: 'demo-ubox', firestore: { host: '127.0.0.1', port: 8080, rules: fs.readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') } })
const agora = Date.now(), dia = 86400000, em = (ms) => new Date(ms)
await env.withSecurityRulesDisabled(async (ctx) => {
  const db = ctx.firestore(); const admin = uids['admin@example.com']
  await setDoc(doc(db, 'config', 'adminCriado'), { uid: admin, email: 'admin@example.com', criadoEm: em(agora - 90 * dia) })
  for (const [id, nome, cidade] of [['un-a', 'Uberaba Centro', 'Uberaba'], ['un-b', 'Araxá', 'Araxá']]) {
    await setDoc(doc(db, 'unidades', id), { nome, cidade, responsavel: nome, email: `${id}@example.com`, uid: null, modulosLiberados: ['manuais', 'universidade', 'checklist', 'marketing', 'chamados', 'senhas', 'estoque', 'crm', 'nuvem'], ativo: true, criadoPor: admin, criadoEm: em(agora - 90 * dia), atualizadoEm: em(agora - 90 * dia) })
  }
  for (const [email, nome, papel, unidadeId, modulos] of contas) {
    const uid = uids[email]
    const d = { uid, email, nome, papel, ativo: true, recusado: false, unidade: unidadeId === 'un-a' ? 'Uberaba Centro' : 'Franqueadora', cidade: 'Uberaba', criadoPor: admin, criadoEm: em(agora - 60 * dia), atualizadoEm: em(agora - 60 * dia), unidadeId }
    if (papel !== 'admin') d.modulosLiberados = modulos
    await setDoc(doc(db, 'usuarios', uid), d)
  }
})
await env.cleanup(); console.log('seed ok')
