// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).
import { pathToFileURL } from 'node:url'

function normalizar(valor = '') {
  valor = valor.trim()
  while (/^(["']).*\1$/s.test(valor)) valor = valor.slice(1, -1).trim()
  return valor
}

function papelDoJwt(valor) {
  const partes = valor.split('.')
  if (partes.length !== 3) return null
  try {
    return JSON.parse(Buffer.from(partes[1], 'base64url').toString('utf8'))?.role
  } catch {
    return null
  }
}

function validar(env) {
  const backend = normalizar(env.VITE_BACKEND).toLowerCase()
  const url = normalizar(env.VITE_SUPABASE_URL)
  const chave = normalizar(env.VITE_SUPABASE_PUBLISHABLE_KEY)

  if (/sb_secret_/i.test(chave) || papelDoJwt(chave) === 'service_role') {
    return 'Use apenas uma chave publicável do Supabase no build do Pages.'
  }
  for (const [nome, valor] of [
    ['VITE_SUPABASE_URL', url],
    ['VITE_SUPABASE_PUBLISHABLE_KEY', chave],
  ]) {
    if ((env[nome] ?? '') !== valor) return `Remova aspas/espaços da variável ${nome}.`
  }
  if (backend === 'supabase' && (!url || !chave)) {
    return 'Configure VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY para o backend Supabase.'
  }
}

export function validarConfigPages(env, informarErro = console.error) {
  const erro = validar(env)
  if (!erro) return 0
  informarErro(erro)
  return 1
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  process.exitCode = validarConfigPages(process.env)
}
