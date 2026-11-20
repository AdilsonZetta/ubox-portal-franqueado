// Feito por Codex (ChatGPT) + Grok Bot no Cursor (Antigravity sem cota).

const papeis = new Set(['admin', 'franqueado', 'equipe_franqueadora', 'equipe_franqueado'])

export function converterData(valor) {
  let milissegundos
  if (typeof valor === 'string') {
    milissegundos = Date.parse(valor)
  } else if (valor && typeof valor === 'object') {
    const segundos = valor._seconds ?? valor.seconds
    const nanos = valor._nanoseconds ?? valor.nanoseconds ?? 0
    if (!Number.isInteger(segundos) || !Number.isInteger(nanos) || nanos < 0 || nanos >= 1e9) return null
    milissegundos = segundos * 1000 + Math.floor(nanos / 1e6)
  }

  const data = new Date(milissegundos)
  return Number.isNaN(data.getTime()) ? null : data.toISOString()
}

function limitarTexto(valor, limite) {
  return typeof valor === 'string' ? Array.from(valor).slice(0, limite).join('') : ''
}

function normalizarEmail(email) {
  return email.trim().toLowerCase()
}

function camposComuns(data, ids) {
  return {
    cidade: limitarTexto(data.cidade, 120),
    modulos_liberados: Array.isArray(data.modulosLiberados)
      ? data.modulosLiberados.filter((modulo) => typeof modulo === 'string').slice(0, 40)
      : [],
    criado_por: ids.get(data.criadoPor) ?? null,
    criado_em: converterData(data.criadoEm),
    atualizado_em: converterData(data.atualizadoEm),
  }
}

export function planejarImportacao({ auth, usuarios, unidades, config }, {
  gerarId = () => crypto.randomUUID(),
} = {}) {
  const ids = new Map()
  const emails = new Set()
  const avisos = []
  const authUsers = []
  const idsDesativados = new Set()
  let contasDuplicadas = 0
  let contasSemEmail = 0

  for (const conta of auth) {
    if (typeof conta.email !== 'string' || !conta.email.trim()) {
      contasSemEmail++
      avisos.push(`Conta Firebase "${conta.uid}" ignorada por falta de e-mail.`)
      continue
    }
    const email = normalizarEmail(conta.email)
    if (emails.has(email)) {
      contasDuplicadas++
      avisos.push(`Conta Firebase "${conta.uid}" ignorada por e-mail duplicado.`)
      continue
    }
    const id = gerarId(conta.uid)
    ids.set(conta.uid, id)
    emails.add(email)
    authUsers.push({ id, email })
    if (conta.disabled === true) idsDesativados.add(id)
  }

  const idsUnidades = new Set(unidades.map(({ id }) => id))
  const perfis = []
  const perfisPorUid = new Map()

  for (const { id: uid, data } of usuarios) {
    const id = ids.get(uid)
    if (!id) {
      avisos.push(`Perfil "${uid}" ignorado por falta de uma conta Firebase no plano.`)
      continue
    }
    const nome = typeof data.nome === 'string' ? limitarTexto(data.nome.trim(), 120) : ''
    if (!papeis.has(data.papel) || Array.from(nome).length < 2) {
      avisos.push(`Perfil "${uid}" ignorado por papel inválido ou nome com menos de 2 caracteres.`)
      continue
    }
    const unidadeId = idsUnidades.has(data.unidadeId) ? data.unidadeId : null
    if (data.unidadeId != null && unidadeId === null) {
      avisos.push(`Perfil "${uid}" ficou sem vínculo com a unidade "${data.unidadeId}", ausente na exportação.`)
    }
    const perfil = {
      id,
      firebase_uid: uid,
      email: limitarTexto(normalizarEmail(data.email), 199),
      nome,
      papel: data.papel,
      ativo: data.ativo === true && !idsDesativados.has(id),
      recusado: data.recusado === true,
      unidade: limitarTexto(data.unidade, 120),
      unidade_id: unidadeId,
      ...camposComuns(data, ids),
    }
    perfis.push(perfil)
    perfisPorUid.set(uid, perfil)
  }

  const unidadesImportadas = unidades.map(({ id, data }) => {
    const uid = perfisPorUid.get(data.uid)?.id ?? null
    if (data.uid != null && uid === null) {
      avisos.push(`Unidade "${id}" ficou sem responsável vinculado porque o perfil "${data.uid}" não foi importado.`)
    }
    return {
      id,
      nome: limitarTexto(data.nome, 120),
      responsavel: limitarTexto(data.responsavel, 120),
      email: limitarTexto(normalizarEmail(data.email), 199),
      uid,
      ativo: data.ativo === true,
      ...camposComuns(data, ids),
    }
  })

  let adminLock = null
  const trava = config?.adminCriado
  if (trava) {
    const admin = perfisPorUid.get(trava.uid)
    if (admin?.papel === 'admin') {
      adminLock = {
        id: 'adminCriado',
        uid: admin.id,
        email: normalizarEmail(trava.email ?? admin.email),
        criado_em: converterData(trava.criadoEm),
      }
    } else {
      avisos.push('Trava de administrador ignorada porque não corresponde a um perfil de admin importado.')
    }
  }

  return {
    authUsers,
    idsDesativados: [...idsDesativados],
    usuarios: perfis,
    unidades: unidadesImportadas,
    adminLock,
    mapaUids: Object.fromEntries(ids),
    avisos,
    contagens: {
      authUsers: authUsers.length,
      usuarios: perfis.length,
      unidades: unidadesImportadas.length,
      adminLock: Number(adminLock !== null),
      contasSemPerfil: authUsers.length - perfis.length,
      perfisIgnorados: usuarios.length - perfis.length,
      contasDuplicadas,
      contasSemEmail,
    },
  }
}
