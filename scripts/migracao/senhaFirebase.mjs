// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
const REDACTED = 'UkVEQUNURUQ='

export function hashRedigido(valor) {
  if (typeof valor !== 'string' || !valor) return true
  if (valor === REDACTED) return true
  try {
    return Buffer.from(valor, 'base64').toString('utf8') === 'REDACTED'
  } catch {
    return true
  }
}

export function montarPasswordHash({ memoryCost, rounds, saltSeparator, signerKey, salt, passwordHash }) {
  if (hashRedigido(passwordHash) || hashRedigido(salt) || !salt) return null
  if (!Number.isInteger(memoryCost) || memoryCost <= 0 || !Number.isInteger(rounds) || rounds <= 0) return null
  if (typeof saltSeparator !== 'string' || !saltSeparator || typeof signerKey !== 'string' || !signerKey) return null
  return `$fbscrypt$v=1,n=${memoryCost},r=${rounds},p=1,ss=${saltSeparator},sk=${signerKey}$${salt}$${passwordHash}`
}

export function lerHashConfig(config) {
  const hc = config?.signIn?.hashConfig ?? config?.hashConfig ?? config ?? {}
  const signerKey = hc.signerKey || hc.signer_key || hc.base64SignerKey || hc.base64_signer_key
  const saltSeparator = hc.saltSeparator || hc.salt_separator || hc.base64SaltSeparator || hc.base64_salt_separator
  const rounds = hc.rounds ?? hc.round
  const memoryCost = hc.memoryCost ?? hc.memory_cost ?? hc.memCost ?? hc.mem_cost
  const algorithm = hc.algorithm || hc.hashAlgorithm || null
  const completo = Boolean(signerKey && saltSeparator && Number.isInteger(rounds) && Number.isInteger(memoryCost))
  return { algorithm, rounds, memoryCost, signerKey: signerKey || null, saltSeparator: saltSeparator || null, completo }
}

export function resumoHashes(contas, params) {
  const comHash = contas.filter(c => !hashRedigido(c.passwordHash) && c.salt)
  const semHash = contas.filter(c => hashRedigido(c.passwordHash) || !c.salt)
  return {
    total: contas.length,
    comHash: comHash.length,
    semHash: semHash.length,
    paramsCompletos: Boolean(params?.completo),
    uidsSemHash: semHash.map(c => c.uid || c.localId).filter(Boolean),
  }
}
