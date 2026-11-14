import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'
import { entrarComoAdmin } from './firebase-client.mjs'

const { db, usuario } = await entrarComoAdmin()
const ref = doc(db, 'usuarios', usuario.uid)
const snap = await getDoc(ref)
if (!snap.exists()) {
  console.error('Esta conta ainda não tem perfil. Crie a conta na tela de cadastro do portal e rode o script de novo.')
  process.exit(1)
}

const perfil = snap.data()
if (perfil.papel === 'admin' && perfil.ativo === true) {
  console.log(`A conta ${usuario.email} já é administradora.`)
} else {
  await updateDoc(ref, {
    papel: 'admin',
    ativo: true,
    recusado: false,
    atualizadoEm: serverTimestamp(),
  })
  console.log(`Promovida a administradora: ${usuario.email}`)
}

const trava = doc(db, 'config', 'adminCriado')
const travaSnap = await getDoc(trava)
if (!travaSnap.exists()) {
  await setDoc(trava, {
    uid: usuario.uid,
    email: usuario.email,
    criadoEm: serverTimestamp(),
  })
  console.log('Trava do primeiro admin gravada em config/adminCriado.')
} else {
  console.log('A trava do primeiro admin já existe. Novas autopromoções ficam bloqueadas.')
}
