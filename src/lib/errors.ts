const AUTH: Record<string, string> = {
  'auth/invalid-email': 'E-mail inválido.',
  'auth/user-not-found': 'Não encontramos uma conta com esse e-mail.',
  'auth/wrong-password': 'Senha incorreta.',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/email-already-in-use': 'Este e-mail já está cadastrado.',
  'auth/weak-password': 'A senha precisa ter pelo menos 6 caracteres.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde um pouco e tente de novo.',
  'auth/network-request-failed': 'Sem conexão com o Firebase. Verifique a rede.',
  'permission-denied':
    'Sem permissão para esta ação. Publique as regras do Firestore (firestore.rules) e confira se a conta está ativa.',
}

export function mensagemErro(erro: unknown): string {
  const codigo =
    typeof erro === 'object' && erro && 'code' in erro ? String((erro as { code: unknown }).code) : ''
  if (AUTH[codigo]) return AUTH[codigo]
  const texto = erro instanceof Error ? erro.message : ''
  if (/requires an index/i.test(texto)) {
    return 'Falta um índice do Firestore. Rode o deploy dos índices descrito no README e aguarde a construção.'
  }
  if (/permission/i.test(texto) || codigo === 'permission-denied') return AUTH['permission-denied']
  if (texto) return texto
  return 'Não foi possível concluir a ação.'
}
